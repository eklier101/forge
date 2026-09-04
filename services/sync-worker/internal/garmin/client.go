package garmin

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"
)

const (
	iosSSOClientID   = "GCM_IOS_DARK"
	iosServiceURL    = "https://mobile.integration.garmin.com/gcm/ios"
	iosLoginUA       = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
	nativeAPIUA      = "GCM-Android-5.23"
	nativeXGarminUA  = "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0"
	diTokenURL       = "https://diauth.garmin.com/di-oauth2-service/oauth/token"
	diGrantType      = "https://connectapi.garmin.com/di-oauth2-service/oauth/grant/service_ticket"
)

var diClientIDs = []string{
	"GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2",
	"GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4",
	"GARMIN_CONNECT_MOBILE_ANDROID_DI",
	"GARMIN_CONNECT_MOBILE_IOS_DI",
}

// Client talks to Garmin Connect via mobile SSO → DI OAuth bearer tokens
// (same flow as modern python-garminconnect; classic embed SSO is dead).
type Client struct {
	Email       string
	Password    string
	DisplayName string
	Token       string
	HTTP        *http.Client
}

func New(email, password string) *Client {
	jar, _ := cookiejar.New(nil)
	return &Client{
		Email:    email,
		Password: password,
		HTTP: &http.Client{
			Timeout: 60 * time.Second,
			Jar:     jar,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
	}
}

func (c *Client) Login() error {
	ticket, err := c.mobileLogin()
	if err != nil {
		return err
	}
	token, err := c.exchangeTicket(ticket, iosServiceURL)
	if err != nil {
		return err
	}
	c.Token = token
	name, err := c.getDisplayName()
	if err != nil {
		return fmt.Errorf("garmin profile: %w", err)
	}
	c.DisplayName = name
	return nil
}

func (c *Client) mobileLogin() (string, error) {
	loginURL := "https://sso.garmin.com/mobile/api/login?" + url.Values{
		"clientId": {iosSSOClientID},
		"locale":   {"en-US"},
		"service":  {iosServiceURL},
	}.Encode()

	body, _ := json.Marshal(map[string]any{
		"username":     c.Email,
		"password":     c.Password,
		"rememberMe":   true,
		"captchaToken": "",
	})
	req, err := http.NewRequest(http.MethodPost, loginURL, strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", iosLoginUA)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://sso.garmin.com")

	res, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return "", err
	}
	if res.StatusCode == 429 {
		return "", fmt.Errorf("garmin rate limit 429")
	}
	if res.StatusCode == 403 {
		return "", fmt.Errorf("garmin login HTTP 403 (bot challenge)")
	}

	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		return "", fmt.Errorf("garmin mobile login non-JSON HTTP %d: %s", res.StatusCode, truncate(string(data), 120))
	}

	statusType := ""
	if rs, ok := parsed["responseStatus"].(map[string]any); ok {
		statusType, _ = rs["type"].(string)
	}

	switch statusType {
	case "SUCCESSFUL":
		ticket, _ := parsed["serviceTicketId"].(string)
		if ticket == "" {
			return "", fmt.Errorf("garmin login: empty service ticket")
		}
		return ticket, nil
	case "MFA_REQUIRED":
		return "", fmt.Errorf("garmin MFA required — cannot complete headless login")
	case "INVALID_USERNAME_PASSWORD":
		return "", fmt.Errorf("garmin login failed: invalid credentials")
	case "CAPTCHA_REQUIRED":
		return "", fmt.Errorf("garmin login: CAPTCHA required")
	}

	if errObj, ok := parsed["error"].(map[string]any); ok {
		if fmt.Sprint(errObj["status-code"]) == "429" {
			return "", fmt.Errorf("garmin rate limit 429")
		}
	}
	return "", fmt.Errorf("garmin mobile login failed: HTTP %d responseStatus=%s", res.StatusCode, statusType)
}

func (c *Client) exchangeTicket(ticket, serviceURL string) (string, error) {
	var lastErr error
	for _, clientID := range diClientIDs {
		form := url.Values{
			"client_id":      {clientID},
			"service_ticket": {ticket},
			"grant_type":     {diGrantType},
			"service_url":    {serviceURL},
		}
		req, err := http.NewRequest(http.MethodPost, diTokenURL, strings.NewReader(form.Encode()))
		if err != nil {
			return "", err
		}
		req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(clientID+":")))
		req.Header.Set("Accept", "application/json,text/html;q=0.9,*/*;q=0.8")
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Cache-Control", "no-cache")
		setNativeHeaders(req)

		res, err := c.HTTP.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		res.Body.Close()
		if res.StatusCode == 429 {
			return "", fmt.Errorf("garmin rate limit 429")
		}
		if res.StatusCode >= 400 {
			lastErr = fmt.Errorf("DI exchange %s HTTP %d: %s", clientID, res.StatusCode, truncate(string(data), 120))
			continue
		}
		var tok map[string]any
		if err := json.Unmarshal(data, &tok); err != nil {
			lastErr = err
			continue
		}
		access, _ := tok["access_token"].(string)
		if access == "" {
			lastErr = fmt.Errorf("DI exchange %s: empty access_token", clientID)
			continue
		}
		return access, nil
	}
	if lastErr != nil {
		return "", fmt.Errorf("garmin DI token exchange failed: %w", lastErr)
	}
	return "", fmt.Errorf("garmin DI token exchange failed for all client IDs")
}

func setNativeHeaders(req *http.Request) {
	req.Header.Set("User-Agent", nativeAPIUA)
	req.Header.Set("X-Garmin-User-Agent", nativeXGarminUA)
	req.Header.Set("X-Garmin-Paired-App-Version", "10861")
	req.Header.Set("X-Garmin-Client-Platform", "Android")
	req.Header.Set("X-App-Ver", "10861")
	req.Header.Set("X-Lang", "en")
	req.Header.Set("X-GCExperience", "GC5")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
}

func (c *Client) getJSON(u string, out any) error {
	req, _ := http.NewRequest(http.MethodGet, u, nil)
	setNativeHeaders(req)
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Accept", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}
	if res.StatusCode == 429 {
		return fmt.Errorf("garmin rate limit 429")
	}
	if res.StatusCode >= 400 {
		return fmt.Errorf("garmin HTTP %d: %s", res.StatusCode, truncate(string(data), 160))
	}
	trim := strings.TrimSpace(string(data))
	if trim == "" || trim[0] == '<' {
		return fmt.Errorf("garmin non-JSON response from %s: %s", u, truncate(trim, 80))
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(data, out)
}

func (c *Client) getDisplayName() (string, error) {
	var social map[string]any
	urls := []string{
		"https://connectapi.garmin.com/userprofile-service/socialProfile",
		"https://connectapi.garmin.com/userprofile-service/userprofile/socialProfile",
		"https://connect.garmin.com/modern/proxy/userprofile-service/socialProfile",
	}
	var last error
	for _, u := range urls {
		if err := c.getJSON(u, &social); err != nil {
			last = err
			continue
		}
		if dn, ok := social["displayName"].(string); ok && dn != "" {
			return dn, nil
		}
		if un, ok := social["userName"].(string); ok && un != "" {
			return un, nil
		}
		last = fmt.Errorf("missing displayName")
	}
	return "", last
}

func (c *Client) DailyStats(day string) (map[string]any, error) {
	var out map[string]any
	urls := []string{
		fmt.Sprintf("https://connectapi.garmin.com/usersummary-service/usersummary/daily/%s?calendarDate=%s", url.PathEscape(c.DisplayName), day),
		fmt.Sprintf("https://connect.garmin.com/modern/proxy/usersummary-service/usersummary/daily/%s?calendarDate=%s", url.PathEscape(c.DisplayName), day),
	}
	var last error
	for _, u := range urls {
		if err := c.getJSON(u, &out); err == nil {
			return out, nil
		} else {
			last = err
		}
	}
	return nil, last
}

func (c *Client) Sleep(day string) (map[string]any, error) {
	var out map[string]any
	urls := []string{
		fmt.Sprintf("https://connectapi.garmin.com/wellness-service/wellness/dailySleepData/%s?date=%s", url.PathEscape(c.DisplayName), day),
		fmt.Sprintf("https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailySleepData/%s?date=%s&nonSleepingZones=true", url.PathEscape(c.DisplayName), day),
	}
	var last error
	for _, u := range urls {
		if err := c.getJSON(u, &out); err == nil {
			return out, nil
		} else {
			last = err
		}
	}
	return nil, last
}

func (c *Client) BodyComposition(day string) (map[string]any, error) {
	var out map[string]any
	urls := []string{
		fmt.Sprintf("https://connectapi.garmin.com/weight-service/weight/dayview/%s", day),
		fmt.Sprintf("https://connect.garmin.com/modern/proxy/weight-service/weight/dayview/%s", day),
		fmt.Sprintf("https://connect.garmin.com/modern/proxy/weight-service/weight/date/%s", day),
	}
	var last error
	for _, u := range urls {
		if err := c.getJSON(u, &out); err == nil {
			return out, nil
		} else {
			last = err
		}
	}
	return nil, last
}

func FirstNum(vals ...any) *float64 {
	for _, v := range vals {
		if v == nil {
			continue
		}
		switch t := v.(type) {
		case float64:
			return &t
		case int:
			f := float64(t)
			return &f
		case json.Number:
			f, err := t.Float64()
			if err == nil {
				return &f
			}
		}
	}
	return nil
}

func MapNum(m map[string]any, keys ...string) *float64 {
	if m == nil {
		return nil
	}
	for _, k := range keys {
		if v, ok := m[k]; ok {
			if n := FirstNum(v); n != nil {
				return n
			}
		}
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
