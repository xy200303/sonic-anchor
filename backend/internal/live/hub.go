package live

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

const channel = "sonic-anchor:live-events"

type Envelope struct {
	SessionID   string          `json:"session_id"`
	MessageType string          `json:"message_type"`
	Data        json.RawMessage `json:"data"`
}

type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*websocket.Conn]struct{}
	redis   *redis.Client
	logger  *zap.Logger
}

func NewHub(redisClient *redis.Client, logger *zap.Logger) *Hub {
	return &Hub{clients: make(map[string]map[*websocket.Conn]struct{}), redis: redisClient, logger: logger}
}

func (h *Hub) Register(sessionID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[sessionID] == nil {
		h.clients[sessionID] = make(map[*websocket.Conn]struct{})
	}
	h.clients[sessionID][conn] = struct{}{}
}

func (h *Hub) Unregister(sessionID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients[sessionID], conn)
	if len(h.clients[sessionID]) == 0 {
		delete(h.clients, sessionID)
	}
}

func (h *Hub) Publish(ctx context.Context, envelope Envelope) error {
	payload, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return h.redis.Publish(ctx, channel, payload).Err()
}

func (h *Hub) Run(ctx context.Context) {
	subscriber := h.redis.Subscribe(ctx, channel)
	defer subscriber.Close()
	for message := range subscriber.Channel() {
		var envelope Envelope
		if err := json.Unmarshal([]byte(message.Payload), &envelope); err != nil {
			continue
		}
		h.broadcast(ctx, envelope.SessionID, []byte(message.Payload))
	}
}

func (h *Hub) broadcast(ctx context.Context, sessionID string, payload []byte) {
	h.mu.RLock()
	connections := make([]*websocket.Conn, 0, len(h.clients[sessionID]))
	for conn := range h.clients[sessionID] {
		connections = append(connections, conn)
	}
	h.mu.RUnlock()
	for _, conn := range connections {
		writeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		err := conn.Write(writeCtx, websocket.MessageText, payload)
		cancel()
		if err != nil {
			h.logger.Warn("websocket write failed", zap.Error(err))
		}
	}
}
