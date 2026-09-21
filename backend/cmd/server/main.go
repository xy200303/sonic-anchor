package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"sonic-anchor/backend/internal/config"
	"sonic-anchor/backend/internal/httpapi"
	"sonic-anchor/backend/internal/live"
	cryptopkg "sonic-anchor/backend/internal/pkg/crypto"
	"sonic-anchor/backend/internal/pkg/database"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}
	logger, _ := zap.NewProduction()
	if cfg.Env != "prod" {
		logger, _ = zap.NewDevelopment()
	}
	defer logger.Sync()
	db, err := database.Connect(cfg.PostgresDSN)
	if err != nil {
		logger.Fatal("connect postgres", zap.Error(err))
	}
	if err := database.Migrate(db); err != nil {
		logger.Fatal("migrate database", zap.Error(err))
	}
	if err := database.SeedAdmin(context.Background(), db, cfg.AdminUsername, cfg.AdminPassword, cfg.AdminName); err != nil {
		logger.Fatal("seed admin", zap.Error(err))
	}
	redisClient := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword, DB: cfg.RedisDB})
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		logger.Fatal("connect redis", zap.Error(err))
	}
	cipher, err := cryptopkg.New(cfg.EncryptionKey)
	if err != nil {
		logger.Fatal("create cipher", zap.Error(err))
	}
	hub := live.NewHub(redisClient, logger)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go hub.Run(ctx)
	router := httpapi.New(cfg, db, redisClient, logger, cipher, hub)
	server := &http.Server{Addr: fmt.Sprintf(":%d", cfg.Port), Handler: router, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 120 * time.Second}
	go func() {
		logger.Info("server started", zap.Int("port", cfg.Port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("server failed", zap.Error(err))
		}
	}()
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	cancel()
	shutdown, stop := context.WithTimeout(context.Background(), 8*time.Second)
	defer stop()
	_ = server.Shutdown(shutdown)
}
