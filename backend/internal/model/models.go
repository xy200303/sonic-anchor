package model

import "time"

type AdminUser struct {
	ID           string    `gorm:"type:varchar(36);primaryKey" json:"id"`
	Username     string    `gorm:"type:varchar(64);uniqueIndex;not null" json:"username"`
	PasswordHash string    `gorm:"type:varchar(255);not null" json:"-"`
	Name         string    `gorm:"type:varchar(100);not null" json:"name"`
	Role         string    `gorm:"type:varchar(32);not null;default:admin" json:"role"`
	Status       int16     `gorm:"not null;default:1" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (AdminUser) TableName() string { return "admin_users" }

type DouyinApp struct {
	ID               string    `gorm:"type:varchar(36);primaryKey" json:"id"`
	Name             string    `gorm:"type:varchar(100);not null" json:"name"`
	AppID            string    `gorm:"type:varchar(100);uniqueIndex;not null" json:"app_id"`
	AppSecretCipher  string    `gorm:"type:text;not null" json:"-"`
	PushSecretCipher string    `gorm:"type:text;not null" json:"-"`
	CallbackKey      string    `gorm:"type:varchar(64);uniqueIndex;not null" json:"callback_key"`
	Enabled          bool      `gorm:"not null;default:true" json:"enabled"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func (DouyinApp) TableName() string { return "douyin_apps" }

type LiveSession struct {
	ID             string     `gorm:"type:varchar(36);primaryKey" json:"id"`
	DouyinAppID    string     `gorm:"type:varchar(36);index;not null" json:"douyin_app_id"`
	RoomID         string     `gorm:"type:varchar(64);index;not null" json:"room_id"`
	AnchorOpenID   string     `gorm:"type:varchar(255);index" json:"anchor_open_id"`
	AnchorNickname string     `gorm:"type:varchar(255)" json:"anchor_nickname"`
	Status         string     `gorm:"type:varchar(32);index;not null" json:"status"`
	StartedAt      time.Time  `json:"started_at"`
	EndedAt        *time.Time `json:"ended_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func (LiveSession) TableName() string { return "live_sessions" }

type LiveEvent struct {
	ID          string    `gorm:"type:varchar(36);primaryKey" json:"id"`
	SessionID   string    `gorm:"type:varchar(36);index;not null" json:"session_id"`
	MessageID   string    `gorm:"type:varchar(128);uniqueIndex;not null" json:"message_id"`
	MessageType string    `gorm:"type:varchar(64);index;not null" json:"message_type"`
	Payload     string    `gorm:"type:jsonb;not null" json:"payload"`
	OccurredAt  time.Time `gorm:"index;not null" json:"occurred_at"`
	CreatedAt   time.Time `json:"created_at"`
}

func (LiveEvent) TableName() string { return "live_events" }

type AuditLog struct {
	ID        string    `gorm:"type:varchar(36);primaryKey" json:"id"`
	UserID    string    `gorm:"type:varchar(36);index" json:"user_id"`
	Action    string    `gorm:"type:varchar(100);index;not null" json:"action"`
	Target    string    `gorm:"type:varchar(255)" json:"target"`
	IP        string    `gorm:"type:varchar(64)" json:"ip"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`
}

func (AuditLog) TableName() string { return "audit_logs" }
