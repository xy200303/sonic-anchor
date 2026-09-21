package douyin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	accessTokenURL = "https://developer.toutiao.com/api/apps/v2/token"
	liveInfoURL    = "https://webcast.bytedance.com/api/webcastmate/info"
	startTaskURL   = "https://webcast.bytedance.com/api/live_data/task/start"
)

type Client struct {
	http  *http.Client
	redis *redis.Client
}

type LiveInfo struct {
	RoomID       string `json:"room_id"`
	AnchorOpenID string `json:"anchor_open_id"`
	AvatarURL    string `json:"avatar_url"`
	Nickname     string `json:"nick_name"`
}

func NewClient(redisClient *redis.Client) *Client {
	return &Client{http: &http.Client{Timeout: 12 * time.Second}, redis: redisClient}
}

func (c *Client) AccessToken(ctx context.Context, appID string, appSecret string) (string, error) {
	cacheKey := "douyin:access_token:" + appID
	if token, err := c.redis.Get(ctx, cacheKey).Result(); err == nil && token != "" {
		return token, nil
	}
	var response struct {
		ErrNo   int    `json:"err_no"`
		ErrTips string `json:"err_tips"`
		Data    struct {
			AccessToken string `json:"access_token"`
			ExpiresIn   int    `json:"expires_in"`
		} `json:"data"`
	}
	if err := c.postJSON(ctx, accessTokenURL, nil, map[string]string{
		"appid": appID, "secret": appSecret, "grant_type": "client_credential",
	}, &response); err != nil {
		return "", err
	}
	if response.ErrNo != 0 || response.Data.AccessToken == "" {
		return "", fmt.Errorf("get access token failed: %s", response.ErrTips)
	}
	ttl := time.Duration(response.Data.ExpiresIn-300) * time.Second
	if ttl <= 0 {
		ttl = 90 * time.Minute
	}
	_ = c.redis.Set(ctx, cacheKey, response.Data.AccessToken, ttl).Err()
	return response.Data.AccessToken, nil
}

func (c *Client) LiveInfo(ctx context.Context, accessToken string, launchToken string) (*LiveInfo, error) {
	var response struct {
		Data struct {
			Info struct {
				RoomID       json.Number `json:"room_id"`
				AnchorOpenID string      `json:"anchor_open_id"`
				AvatarURL    string      `json:"avatar_url"`
				Nickname     string      `json:"nick_name"`
			} `json:"info"`
		} `json:"data"`
		ErrNo  int    `json:"err_no"`
		ErrMsg string `json:"err_msg"`
	}
	if err := c.postJSON(ctx, liveInfoURL, map[string]string{"x-token": accessToken}, map[string]string{"token": launchToken}, &response); err != nil {
		return nil, err
	}
	roomID := response.Data.Info.RoomID.String()
	if response.ErrNo != 0 || roomID == "" {
		return nil, fmt.Errorf("get live info failed: %s", response.ErrMsg)
	}
	return &LiveInfo{RoomID: roomID, AnchorOpenID: response.Data.Info.AnchorOpenID, AvatarURL: response.Data.Info.AvatarURL, Nickname: response.Data.Info.Nickname}, nil
}

func (c *Client) StartTask(ctx context.Context, accessToken string, appID string, roomID string, messageType string) error {
	var response struct {
		ErrNo  int    `json:"err_no"`
		ErrMsg string `json:"err_msg"`
	}
	err := c.postJSON(ctx, startTaskURL, map[string]string{"access-token": accessToken}, map[string]string{
		"appid": appID, "roomid": roomID, "msg_type": messageType,
	}, &response)
	if err != nil {
		return err
	}
	if response.ErrNo != 0 {
		return errors.New(response.ErrMsg)
	}
	return nil
}

func (c *Client) postJSON(ctx context.Context, url string, headers map[string]string, payload any, target any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("douyin api returned http %d", response.StatusCode)
	}
	return json.NewDecoder(response.Body).Decode(target)
}
