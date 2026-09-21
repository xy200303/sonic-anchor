package auth

import (
	"errors"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	Role      string `json:"role"`
	Kind      string `json:"kind"`
	SessionID string `json:"session_id,omitempty"`
	jwt.RegisteredClaims
}

type Manager struct {
	secret []byte
}

func New(secret string) *Manager {
	return &Manager{secret: []byte(secret)}
}

func (m *Manager) AdminToken(userID string, username string, role string) (string, error) {
	return m.sign(Claims{
		UserID: userID, Username: username, Role: role, Kind: "admin",
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(2 * time.Hour)), IssuedAt: jwt.NewNumericDate(time.Now())},
	})
}

func (m *Manager) DesktopTicket(sessionID string) (string, error) {
	return m.sign(Claims{
		Kind: "desktop_ws", SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(5 * time.Minute)), IssuedAt: jwt.NewNumericDate(time.Now())},
	})
}

func (m *Manager) Parse(raw string, kind string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(raw, &Claims{}, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || claims.Kind != kind {
		return nil, errors.New("invalid token kind")
	}
	return claims, nil
}

func (m *Manager) AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(401, gin.H{"code": 40101, "message": "未登录", "data": nil})
			return
		}
		claims, err := m.Parse(strings.TrimPrefix(header, "Bearer "), "admin")
		if err != nil {
			c.AbortWithStatusJSON(401, gin.H{"code": 40102, "message": "登录状态已失效", "data": nil})
			return
		}
		c.Set("claims", claims)
		c.Next()
	}
}

func (m *Manager) sign(claims Claims) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}
