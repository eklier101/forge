package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

type Account struct {
	UserID      string         `json:"userId"`
	Provider    string         `json:"provider"`
	Credentials map[string]any `json:"credentials"`
	ForceSyncAt any            `json:"forceSyncAt"`
}

func WorkerKey() string {
	if t := os.Getenv("FORGE_INTEGRATION_TOKEN"); t != "" {
		return t
	}
	if t := os.Getenv("INTEGRATION_TOKEN"); t != "" {
		return t
	}
	if secret := os.Getenv("JWT_SECRET"); secret != "" {
		sum := sha256.Sum256([]byte(secret + ":forge-sync-worker"))
		return hex.EncodeToString(sum[:])
	}
	return ""
}

func NewFromEnv() *Client {
	base := os.Getenv("FORGE_API_URL")
	if base == "" {
		base = "http://api:3000"
	}
	for len(base) > 0 && base[len(base)-1] == '/' {
		base = base[:len(base)-1]
	}
	return &Client{
		BaseURL: base,
		Token:   WorkerKey(),
		HTTP:    &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *Client) headers() http.Header {
	h := make(http.Header)
	h.Set("Authorization", "Bearer "+c.Token)
	h.Set("X-Forge-Token", c.Token)
	h.Set("Content-Type", "application/json")
	return h
}

func (c *Client) doJSON(method, path string, body any, out any) (int, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.BaseURL+path, rdr)
	if err != nil {
		return 0, err
	}
	req.Header = c.headers()
	res, err := c.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return res.StatusCode, err
	}
	if out != nil && len(data) > 0 && res.StatusCode < 500 {
		_ = json.Unmarshal(data, out)
	}
	if res.StatusCode >= 400 {
		snippet := string(data)
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return res.StatusCode, fmt.Errorf("HTTP %d: %s", res.StatusCode, snippet)
	}
	return res.StatusCode, nil
}

func (c *Client) FetchAccounts() (accounts []Account, hasForce bool, apiOK bool) {
	var payload struct {
		Accounts     []Account `json:"accounts"`
		HasForceSync bool      `json:"hasForceSync"`
	}
	_, err := c.doJSON(http.MethodGet, "/integrations/worker/accounts", nil, &payload)
	if err != nil {
		fmt.Printf("api unreachable (will retry): %v\n", err)
		return nil, false, false
	}
	return payload.Accounts, payload.HasForceSync, true
}

func (c *Client) ReportStatus(provider, userID string, ok bool, errMsg string, needsReauth bool) {
	body := map[string]any{
		"provider":    provider,
		"userId":      userID,
		"ok":          ok,
		"needsReauth": needsReauth,
	}
	if errMsg != "" {
		body["error"] = errMsg
	}
	_, _ = c.doJSON(http.MethodPost, "/integrations/sync-status", body, nil)
}

func (c *Client) PostJSON(path string, body any) error {
	_, err := c.doJSON(http.MethodPost, path, body, nil)
	return err
}

func Creds(acct Account) (email, password string) {
	if acct.Credentials == nil {
		return "", ""
	}
	if e, ok := acct.Credentials["email"].(string); ok {
		email = e
	}
	if p, ok := acct.Credentials["password"].(string); ok {
		password = p
	}
	return email, password
}

func HasForce(acct Account) bool {
	return acct.ForceSyncAt != nil && acct.ForceSyncAt != false && acct.ForceSyncAt != ""
}
