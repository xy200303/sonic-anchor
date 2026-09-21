package httpapi

import (
	"crypto/md5"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"sonic-anchor/backend/internal/auth"
	"sonic-anchor/backend/internal/config"
	"sonic-anchor/backend/internal/douyin"
	"sonic-anchor/backend/internal/live"
	"sonic-anchor/backend/internal/model"
	cryptopkg "sonic-anchor/backend/internal/pkg/crypto"
)

type Server struct {
	cfg    *config.Config
	db     *gorm.DB
	redis  *redis.Client
	logger *zap.Logger
	auth   *auth.Manager
	cipher *cryptopkg.Cipher
	douyin *douyin.Client
	hub    *live.Hub
}

func New(cfg *config.Config, db *gorm.DB, redisClient *redis.Client, logger *zap.Logger, cipher *cryptopkg.Cipher, hub *live.Hub) *gin.Engine {
	server := &Server{cfg: cfg, db: db, redis: redisClient, logger: logger, auth: auth.New(cfg.JWTSecret), cipher: cipher, douyin: douyin.NewClient(redisClient), hub: hub}
	if cfg.Env == "prod" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.New()
	router.Use(gin.Recovery(), cors.New(cors.Config{
		AllowOrigins: cfg.CORSAllowOrigins, AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}, AllowHeaders: []string{"Authorization", "Content-Type", "X-Desktop-Key"}, AllowCredentials: true, MaxAge: 12 * time.Hour,
	}))
	router.GET("/healthz", func(c *gin.Context) { ok(c, gin.H{"status": "up"}) })
	router.GET("/readyz", server.ready)
	router.GET("/ws/desktop", server.desktopWebSocket)
	router.POST("/callbacks/douyin/live-data/:key", server.douyinCallback)

	admin := router.Group("/api/admin")
	admin.POST("/auth/login", server.login)
	secured := admin.Group("")
	secured.Use(server.auth.AdminMiddleware())
	secured.GET("/auth/me", server.me)
	secured.GET("/dashboard", server.dashboard)
	secured.GET("/douyin/apps", server.listDouyinApps)
	secured.POST("/douyin/apps", server.createDouyinApp)
	secured.PUT("/douyin/apps/:id", server.updateDouyinApp)
	secured.DELETE("/douyin/apps/:id", server.deleteDouyinApp)
	secured.GET("/live/sessions", server.listLiveSessions)
	secured.GET("/system/users", server.listUsers)

	desktop := router.Group("/api/desktop")
	desktop.Use(server.desktopAuth)
	desktop.POST("/live/start", server.startLive)
	desktop.POST("/live/:id/stop", server.stopLive)

	server.mountAdmin(router)
	return router
}

func (s *Server) ready(c *gin.Context) {
	if sqlDB, err := s.db.DB(); err != nil || sqlDB.PingContext(c) != nil || s.redis.Ping(c).Err() != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": 50300, "message": "not ready", "data": nil})
		return
	}
	ok(c, gin.H{"status": "ready"})
}

func (s *Server) login(c *gin.Context) {
	var request struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if c.ShouldBindJSON(&request) != nil {
		fail(c, 40001, "参数错误", http.StatusBadRequest)
		return
	}
	var user model.AdminUser
	if err := s.db.Where("username = ? AND status = 1", request.Username).First(&user).Error; err != nil || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(request.Password)) != nil {
		fail(c, 40101, "用户名或密码错误", http.StatusUnauthorized)
		return
	}
	token, err := s.auth.AdminToken(user.ID, user.Username, user.Role)
	if err != nil {
		fail(c, 50000, "登录失败", 500)
		return
	}
	s.audit(c, user.ID, "auth.login", user.Username)
	ok(c, gin.H{"access_token": token, "expires_in": 7200, "user": user})
}

func (s *Server) me(c *gin.Context) {
	claims := c.MustGet("claims").(*auth.Claims)
	var user model.AdminUser
	if err := s.db.First(&user, "id = ?", claims.UserID).Error; err != nil {
		fail(c, 40401, "用户不存在", 404)
		return
	}
	ok(c, user)
}

func (s *Server) dashboard(c *gin.Context) {
	var apps, activeSessions, eventsToday, users int64
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	s.db.Model(&model.DouyinApp{}).Count(&apps)
	s.db.Model(&model.LiveSession{}).Where("status = ?", "live").Count(&activeSessions)
	s.db.Model(&model.LiveEvent{}).Where("created_at >= ?", start).Count(&eventsToday)
	s.db.Model(&model.AdminUser{}).Count(&users)
	ok(c, gin.H{"apps": apps, "active_sessions": activeSessions, "events_today": eventsToday, "users": users})
}

type appInput struct {
	Name       string `json:"name"`
	AppID      string `json:"app_id"`
	AppSecret  string `json:"app_secret"`
	PushSecret string `json:"push_secret"`
	Enabled    *bool  `json:"enabled"`
}

func (s *Server) listDouyinApps(c *gin.Context) {
	var apps []model.DouyinApp
	s.db.Order("created_at DESC").Find(&apps)
	result := make([]gin.H, 0, len(apps))
	for _, app := range apps {
		result = append(result, gin.H{"id": app.ID, "name": app.Name, "app_id": app.AppID, "callback_key": app.CallbackKey, "callback_url": s.cfg.PublicBaseURL + "/callbacks/douyin/live-data/" + app.CallbackKey, "enabled": app.Enabled, "has_app_secret": app.AppSecretCipher != "", "has_push_secret": app.PushSecretCipher != "", "created_at": app.CreatedAt, "updated_at": app.UpdatedAt})
	}
	ok(c, result)
}

func (s *Server) createDouyinApp(c *gin.Context) {
	var input appInput
	if c.ShouldBindJSON(&input) != nil || input.Name == "" || input.AppID == "" || input.AppSecret == "" || input.PushSecret == "" {
		fail(c, 40001, "请填写完整配置", 400)
		return
	}
	appSecret, err := s.cipher.Encrypt(input.AppSecret)
	if err != nil {
		fail(c, 50000, "加密失败", 500)
		return
	}
	pushSecret, err := s.cipher.Encrypt(input.PushSecret)
	if err != nil {
		fail(c, 50000, "加密失败", 500)
		return
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	app := model.DouyinApp{ID: uuid.NewString(), Name: input.Name, AppID: input.AppID, AppSecretCipher: appSecret, PushSecretCipher: pushSecret, CallbackKey: strings.ReplaceAll(uuid.NewString(), "-", ""), Enabled: enabled}
	if err := s.db.Create(&app).Error; err != nil {
		fail(c, 40901, "AppID 已存在", 409)
		return
	}
	s.audit(c, currentUserID(c), "douyin_app.create", app.ID)
	ok(c, gin.H{"id": app.ID})
}

func (s *Server) updateDouyinApp(c *gin.Context) {
	var app model.DouyinApp
	if s.db.First(&app, "id = ?", c.Param("id")).Error != nil {
		fail(c, 40401, "应用不存在", 404)
		return
	}
	var input appInput
	if c.ShouldBindJSON(&input) != nil {
		fail(c, 40001, "参数错误", 400)
		return
	}
	if input.Name != "" {
		app.Name = input.Name
	}
	if input.AppID != "" {
		app.AppID = input.AppID
	}
	if input.Enabled != nil {
		app.Enabled = *input.Enabled
	}
	if input.AppSecret != "" {
		app.AppSecretCipher, _ = s.cipher.Encrypt(input.AppSecret)
	}
	if input.PushSecret != "" {
		app.PushSecretCipher, _ = s.cipher.Encrypt(input.PushSecret)
	}
	if err := s.db.Save(&app).Error; err != nil {
		fail(c, 40901, "保存失败", 409)
		return
	}
	s.audit(c, currentUserID(c), "douyin_app.update", app.ID)
	ok(c, nil)
}

func (s *Server) deleteDouyinApp(c *gin.Context) {
	var count int64
	s.db.Model(&model.LiveSession{}).Where("douyin_app_id = ?", c.Param("id")).Count(&count)
	if count > 0 {
		fail(c, 40902, "已有直播记录，不能删除，可改为停用", 409)
		return
	}
	if s.db.Delete(&model.DouyinApp{}, "id = ?", c.Param("id")).RowsAffected == 0 {
		fail(c, 40401, "应用不存在", 404)
		return
	}
	s.audit(c, currentUserID(c), "douyin_app.delete", c.Param("id"))
	ok(c, nil)
}

func (s *Server) listLiveSessions(c *gin.Context) {
	var sessions []model.LiveSession
	s.db.Order("started_at DESC").Limit(200).Find(&sessions)
	ok(c, sessions)
}

func (s *Server) listUsers(c *gin.Context) {
	var users []model.AdminUser
	s.db.Order("created_at DESC").Find(&users)
	ok(c, users)
}

func (s *Server) desktopAuth(c *gin.Context) {
	if subtle.ConstantTimeCompare([]byte(c.GetHeader("X-Desktop-Key")), []byte(s.cfg.DesktopSharedKey)) != 1 {
		fail(c, 40101, "桌面端认证失败", 401)
		c.Abort()
		return
	}
	c.Next()
}

func (s *Server) startLive(c *gin.Context) {
	var request struct {
		Token string `json:"token"`
		AppID string `json:"app_id"`
	}
	if c.ShouldBindJSON(&request) != nil || request.Token == "" {
		fail(c, 40001, "缺少直播伴侣 token", 400)
		return
	}
	var app model.DouyinApp
	query := s.db.Where("enabled = true")
	if request.AppID != "" {
		query = query.Where("app_id = ?", request.AppID)
	}
	if query.First(&app).Error != nil {
		fail(c, 40401, "未配置可用的抖音应用", 404)
		return
	}
	appSecret, err := s.cipher.Decrypt(app.AppSecretCipher)
	if err != nil {
		fail(c, 50001, "应用密钥解密失败", 500)
		return
	}
	accessToken, err := s.douyin.AccessToken(c, app.AppID, appSecret)
	if err != nil {
		fail(c, 50201, err.Error(), 502)
		return
	}
	info, err := s.douyin.LiveInfo(c, accessToken, request.Token)
	if err != nil {
		fail(c, 50202, err.Error(), 502)
		return
	}
	if err := s.douyin.StartTask(c, accessToken, app.AppID, info.RoomID, "live_comment"); err != nil {
		fail(c, 50203, err.Error(), 502)
		return
	}
	now := time.Now()
	session := model.LiveSession{ID: uuid.NewString(), DouyinAppID: app.ID, RoomID: info.RoomID, AnchorOpenID: info.AnchorOpenID, AnchorNickname: info.Nickname, Status: "live", StartedAt: now}
	if err := s.db.Create(&session).Error; err != nil {
		fail(c, 50000, "创建直播会话失败", 500)
		return
	}
	ticket, _ := s.auth.DesktopTicket(session.ID)
	ok(c, gin.H{"session": session, "ws_url": strings.Replace(s.cfg.PublicBaseURL, "http", "ws", 1) + "/ws/desktop?ticket=" + ticket})
}

func (s *Server) stopLive(c *gin.Context) {
	now := time.Now()
	result := s.db.Model(&model.LiveSession{}).Where("id = ? AND status = ?", c.Param("id"), "live").Updates(map[string]any{"status": "ended", "ended_at": &now})
	if result.RowsAffected == 0 {
		fail(c, 40401, "直播会话不存在", 404)
		return
	}
	ok(c, nil)
}

func (s *Server) desktopWebSocket(c *gin.Context) {
	claims, err := s.auth.Parse(c.Query("ticket"), "desktop_ws")
	if err != nil {
		c.Status(401)
		return
	}
	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{OriginPatterns: []string{"*"}})
	if err != nil {
		return
	}
	s.hub.Register(claims.SessionID, conn)
	defer s.hub.Unregister(claims.SessionID, conn)
	defer conn.Close(websocket.StatusNormalClosure, "closed")
	for {
		if _, _, err := conn.Read(c); err != nil {
			return
		}
	}
}

func (s *Server) douyinCallback(c *gin.Context) {
	var app model.DouyinApp
	if s.db.First(&app, "callback_key = ? AND enabled = true", c.Param("key")).Error != nil {
		c.Status(404)
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 2<<20))
	if err != nil {
		c.Status(400)
		return
	}
	secret, err := s.cipher.Decrypt(app.PushSecretCipher)
	if err != nil || !verifySignature(c.Request.Header, body, secret) {
		c.Status(401)
		return
	}
	roomID := c.GetHeader("x-roomid")
	messageType := c.GetHeader("x-msg-type")
	var session model.LiveSession
	if s.db.Where("douyin_app_id = ? AND room_id = ? AND status = ?", app.ID, roomID, "live").Order("started_at DESC").First(&session).Error != nil {
		c.Status(204)
		return
	}
	var items []map[string]any
	if json.Unmarshal(body, &items) != nil {
		c.Status(400)
		return
	}
	for _, item := range items {
		messageID := fmt.Sprint(item["msg_id"])
		if messageID == "" || messageID == "<nil>" {
			messageID = uuid.NewString()
		}
		added, _ := s.redis.SetNX(c, "douyin:message:"+messageID, "1", 24*time.Hour).Result()
		if !added {
			continue
		}
		payload, _ := json.Marshal(item)
		event := model.LiveEvent{ID: uuid.NewString(), SessionID: session.ID, MessageID: messageID, MessageType: messageType, Payload: string(payload), OccurredAt: time.Now()}
		go func() {
			if err := s.db.Create(&event).Error; err != nil {
				s.logger.Warn("persist live event failed", zap.Error(err))
			}
		}()
		_ = s.hub.Publish(c, live.Envelope{SessionID: session.ID, MessageType: messageType, Data: payload})
	}
	c.Status(204)
}

func verifySignature(headers http.Header, body []byte, secret string) bool {
	signature := headers.Get("x-signature")
	if signature == "" {
		return false
	}
	values := map[string]string{"x-msg-type": headers.Get("x-msg-type"), "x-nonce-str": headers.Get("x-nonce-str"), "x-roomid": headers.Get("x-roomid"), "x-timestamp": headers.Get("x-timestamp")}
	keys := make([]string, 0, len(values))
	for key, value := range values {
		if value != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+values[key])
	}
	raw := strings.Join(parts, "&") + string(body) + secret
	digest := md5.Sum([]byte(raw))
	expected := base64.StdEncoding.EncodeToString(digest[:])
	return subtle.ConstantTimeCompare([]byte(expected), []byte(signature)) == 1
}

func (s *Server) audit(c *gin.Context, userID string, action string, target string) {
	_ = s.db.Create(&model.AuditLog{ID: uuid.NewString(), UserID: userID, Action: action, Target: target, IP: c.ClientIP()}).Error
}
func currentUserID(c *gin.Context) string {
	if claims, ok := c.Get("claims"); ok {
		return claims.(*auth.Claims).UserID
	}
	return ""
}
func ok(c *gin.Context, data any) { c.JSON(200, gin.H{"code": 0, "message": "success", "data": data}) }
func fail(c *gin.Context, code int, message string, status int) {
	c.JSON(status, gin.H{"code": code, "message": message, "data": nil})
}

func (s *Server) mountAdmin(router *gin.Engine) {
	if s.cfg.AdminDistPath == "" {
		return
	}
	index := filepath.Join(s.cfg.AdminDistPath, "index.html")
	if _, err := os.Stat(index); err != nil {
		return
	}
	router.Static("/assets", filepath.Join(s.cfg.AdminDistPath, "assets"))
	router.NoRoute(func(c *gin.Context) {
		if c.Request.Method == http.MethodGet {
			c.File(index)
			return
		}
		c.Status(404)
	})
}
