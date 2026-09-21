package config

import (
	"encoding/base64"
	"errors"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Env              string
	Port             int
	AdminDistPath    string
	PostgresDSN      string
	RedisAddr        string
	RedisPassword    string
	RedisDB          int
	JWTSecret        string
	EncryptionKey    []byte
	DesktopSharedKey string
	AdminUsername    string
	AdminPassword    string
	AdminName        string
	CORSAllowOrigins []string
	PublicBaseURL    string
}

func Load() (*Config, error) {
	_ = godotenv.Load()
	port, _ := strconv.Atoi(value("SERVER_PORT", "8090"))
	redisDB, _ := strconv.Atoi(value("REDIS_DB", "0"))
	jwtSecret := value("JWT_SECRET", "dev-only-change-this-jwt-secret-32")
	rawEncryptionKey := os.Getenv("DATA_ENCRYPTION_KEY")
	key, err := decodeKey(rawEncryptionKey, jwtSecret)
	if err != nil {
		return nil, err
	}
	cfg := &Config{
		Env:              value("APP_ENV", "dev"),
		Port:             port,
		AdminDistPath:    os.Getenv("ADMIN_DIST_PATH"),
		PostgresDSN:      value("POSTGRES_DSN", "host=127.0.0.1 port=5432 user=postgres password=change-me dbname=sonic_anchor sslmode=disable TimeZone=Asia/Shanghai"),
		RedisAddr:        value("REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword:    os.Getenv("REDIS_PASSWORD"),
		RedisDB:          redisDB,
		JWTSecret:        jwtSecret,
		EncryptionKey:    key,
		DesktopSharedKey: value("DESKTOP_SHARED_KEY", "dev-desktop-key"),
		AdminUsername:    value("ADMIN_USERNAME", "admin"),
		AdminPassword:    value("ADMIN_PASSWORD", "Admin@123456"),
		AdminName:        value("ADMIN_NAME", "系统管理员"),
		CORSAllowOrigins: split(value("CORS_ALLOW_ORIGINS", "http://localhost:5180")),
		PublicBaseURL:    strings.TrimRight(value("PUBLIC_BASE_URL", "http://localhost:8090"), "/"),
	}
	if cfg.Env == "prod" && (len(cfg.JWTSecret) < 32 || strings.Contains(cfg.JWTSecret, "replace") || cfg.DesktopSharedKey == "dev-desktop-key" || strings.Contains(cfg.DesktopSharedKey, "replace") || rawEncryptionKey == "" || cfg.AdminPassword == "Admin@123456") {
		return nil, errors.New("production secrets are not configured")
	}
	return cfg, nil
}

func decodeKey(raw string, fallback string) ([]byte, error) {
	if raw == "" {
		key := make([]byte, 32)
		copy(key, []byte(fallback))
		return key, nil
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(key) != 32 {
		return nil, errors.New("DATA_ENCRYPTION_KEY must be base64 encoded 32 bytes")
	}
	return key, nil
}

func value(key string, fallback string) string {
	if current := os.Getenv(key); current != "" {
		return current
	}
	return fallback
}

func split(raw string) []string {
	items := strings.Split(raw, ",")
	result := make([]string, 0, len(items))
	for _, item := range items {
		if item = strings.TrimSpace(item); item != "" {
			result = append(result, item)
		}
	}
	return result
}
