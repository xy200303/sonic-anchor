package database

import (
	"context"
	"embed"
	"errors"

	"github.com/google/uuid"
	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"sonic-anchor/backend/internal/model"
)

//go:embed migrations/*.sql
var migrations embed.FS

func Connect(dsn string) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(dsn), &gorm.Config{})
}

func Migrate(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(sqlDB, "migrations")
}

func SeedAdmin(ctx context.Context, db *gorm.DB, username string, password string, name string) error {
	var count int64
	if err := db.WithContext(ctx).Model(&model.AdminUser{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	if password == "" {
		return errors.New("ADMIN_PASSWORD is required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return db.WithContext(ctx).Create(&model.AdminUser{
		ID: uuid.NewString(), Username: username, PasswordHash: string(hash), Name: name, Role: "super_admin", Status: 1,
	}).Error
}
