-- +goose Up
CREATE TABLE admin_users (
    id varchar(36) PRIMARY KEY,
    username varchar(64) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    name varchar(100) NOT NULL,
    role varchar(32) NOT NULL DEFAULT 'admin',
    status smallint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE douyin_apps (
    id varchar(36) PRIMARY KEY,
    name varchar(100) NOT NULL,
    app_id varchar(100) NOT NULL UNIQUE,
    app_secret_cipher text NOT NULL,
    push_secret_cipher text NOT NULL,
    callback_key varchar(64) NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE live_sessions (
    id varchar(36) PRIMARY KEY,
    douyin_app_id varchar(36) NOT NULL REFERENCES douyin_apps(id),
    room_id varchar(64) NOT NULL,
    anchor_open_id varchar(255) NOT NULL DEFAULT '',
    anchor_nickname varchar(255) NOT NULL DEFAULT '',
    status varchar(32) NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_sessions_room_status ON live_sessions(room_id, status);

CREATE TABLE live_events (
    id varchar(36) PRIMARY KEY,
    session_id varchar(36) NOT NULL REFERENCES live_sessions(id),
    message_id varchar(128) NOT NULL UNIQUE,
    message_type varchar(64) NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_events_session_time ON live_events(session_id, occurred_at DESC);

CREATE TABLE audit_logs (
    id varchar(36) PRIMARY KEY,
    user_id varchar(36) NOT NULL DEFAULT '',
    action varchar(100) NOT NULL,
    target varchar(255) NOT NULL DEFAULT '',
    ip varchar(64) NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS live_events;
DROP TABLE IF EXISTS live_sessions;
DROP TABLE IF EXISTS douyin_apps;
DROP TABLE IF EXISTS admin_users;
