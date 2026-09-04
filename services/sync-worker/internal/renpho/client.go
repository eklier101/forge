package renpho

import (
	"bytes"
	"crypto/aes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	baseURL       = "https://cloud.renpho.com"
	encryptionKey = "ed*wijdi$h6fe3ew"
	appVersion    = "6.6.0"
	platform      = "android"
)

var bodyWeightScales = []string{
	"01", "02", "03", "04", "05", "06", "07", "08", "09", "0A",
	"0B", "0C", "0D", "0E", "0F", "10", "11", "12", "13", "14",
}

var successCodes = map[string]bool{
	"0": true, "101": true, "200": true, "20000": true,
}

type Client struct {
	Email    string
	Password string
	Token    string
	UserID   string // exact digit string — IDs exceed float64 precision
	HTTP     *http.Client
}

func New(email, password string) *Client {
	return &Client{
		Email:    email,
		Password: password,
		HTTP:     &http.Client{Timeout: 45 * time.Second},
	}
}

func pkcs7Pad(data []byte, blockSize int) []byte {
	pad := blockSize - len(data)%blockSize
	out := make([]byte, len(data)+pad)
	copy(out, data)
	for i := len(data); i < len(out); i++ {
		out[i] = byte(pad)
	}
	return out
}

func pkcs7Unpad(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty")
	}
	pad := int(data[len(data)-1])
	if pad == 0 || pad > len(data) {
		return nil, fmt.Errorf("bad padding")
	}
	return data[:len(data)-pad], nil
}

func aesEncrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher([]byte(encryptionKey))
	if err != nil {
		return "", err
	}
	padded := pkcs7Pad([]byte(plaintext), block.BlockSize())
	out := make([]byte, len(padded))
	for i := 0; i < len(padded); i += block.BlockSize() {
		block.Encrypt(out[i:i+block.BlockSize()], padded[i:i+block.BlockSize()])
	}
	return base64.StdEncoding.EncodeToString(out), nil
}

func aesDecrypt(b64 string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher([]byte(encryptionKey))
	if err != nil {
		return "", err
	}
	if len(raw)%block.BlockSize() != 0 {
		return "", fmt.Errorf("bad ciphertext length")
	}
	out := make([]byte, len(raw))
	for i := 0; i < len(raw); i += block.BlockSize() {
		block.Decrypt(out[i:i+block.BlockSize()], raw[i:i+block.BlockSize()])
	}
	unpadded, err := pkcs7Unpad(out)
	if err != nil {
		return "", err
	}
	return string(unpadded), nil
}

func encryptRequest(obj any) (map[string]string, error) {
	// Match renpho-py: compact JSON separators.
	b, err := json.Marshal(obj)
	if err != nil {
		return nil, err
	}
	enc, err := aesEncrypt(string(b))
	if err != nil {
		return nil, err
	}
	return map[string]string{"encryptData": enc}, nil
}

// idString keeps Renpho user IDs as exact digit strings (they exceed float64 precision).
func idString(v any) string {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case json.Number:
		return t.String()
	case float64:
		return strconv.FormatFloat(t, 'f', 0, 64)
	case int64:
		return strconv.FormatInt(t, 10)
	case int:
		return strconv.Itoa(t)
	default:
		s := fmt.Sprint(v)
		if strings.ContainsAny(s, "eE") {
			if f, err := strconv.ParseFloat(s, 64); err == nil {
				return strconv.FormatFloat(f, 'f', 0, 64)
			}
		}
		return s
	}
}

func decodeJSONNumber(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var out any
	if err := dec.Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

func encryptEmptyBytes() (map[string]string, error) {
	block, err := aes.NewCipher([]byte(encryptionKey))
	if err != nil {
		return nil, err
	}
	padded := pkcs7Pad([]byte{}, block.BlockSize())
	out := make([]byte, len(padded))
	for i := 0; i < len(padded); i += block.BlockSize() {
		block.Encrypt(out[i:i+block.BlockSize()], padded[i:i+block.BlockSize()])
	}
	return map[string]string{"encryptData": base64.StdEncoding.EncodeToString(out)}, nil
}

func (c *Client) post(endpoint string, body map[string]string, auth bool) (map[string]any, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, baseURL+"/"+endpoint, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if auth && c.Token != "" {
		req.Header.Set("token", c.Token)
		req.Header.Set("userId", fmt.Sprint(c.UserID))
		req.Header.Set("appVersion", appVersion)
		req.Header.Set("platform", platform)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("renpho HTTP %d: %s", res.StatusCode, truncate(string(data), 200))
	}
	var parsed map[string]any
	out, err := decodeJSONNumber(data)
	if err != nil {
		return nil, err
	}
	parsed, _ = out.(map[string]any)
	if parsed == nil {
		return nil, fmt.Errorf("renpho: unexpected JSON root")
	}
	return parsed, nil
}

func checkResponse(result map[string]any, action string) error {
	code := fmt.Sprint(result["code"])
	if successCodes[code] {
		return nil
	}
	msg := fmt.Sprint(result["msg"])
	if msg == "" || msg == "<nil>" {
		msg = fmt.Sprint(result["message"])
	}
	return fmt.Errorf("%s failed code=%s msg=%s", action, code, msg)
}

func decryptDataField(result map[string]any) (any, error) {
	enc, _ := result["data"].(string)
	if enc == "" {
		return nil, fmt.Errorf("missing encrypted data")
	}
	plain, err := aesDecrypt(enc)
	if err != nil {
		return nil, err
	}
	return decodeJSONNumber([]byte(plain))
}

func (c *Client) Login() error {
	payload := map[string]any{
		"questionnaire": map[string]any{},
		"login": map[string]any{
			"password":     c.Password,
			"areaCode":     "US",
			"appRevision":  appVersion,
			"cellphoneType": "ForgeSyncWorker",
			"systemType":   "11",
			"email":        c.Email,
			"platform":     platform,
		},
		"bindingList": map[string]any{
			"deviceTypes": bodyWeightScales,
		},
	}
	enc, err := encryptRequest(payload)
	if err != nil {
		return err
	}
	result, err := c.post("renpho-aggregation/user/login", enc, false)
	if err != nil {
		return err
	}
	if err := checkResponse(result, "Login"); err != nil {
		return err
	}
	userData, err := decryptDataField(result)
	if err != nil {
		return err
	}
	ud, _ := userData.(map[string]any)
	login, _ := ud["login"].(map[string]any)
	token, _ := login["token"].(string)
	if token == "" {
		return fmt.Errorf("Login: no token in response")
	}
	c.Token = token
	c.UserID = idString(login["id"])
	if c.UserID == "" {
		return fmt.Errorf("Login: no user id in response")
	}
	return nil
}

func (c *Client) deviceInfo() (map[string]any, error) {
	bodies := []func() (map[string]string, error){encryptEmptyBytes, func() (map[string]string, error) { return encryptRequest(map[string]any{}) }}
	var lastErr error
	for _, fn := range bodies {
		enc, err := fn()
		if err != nil {
			lastErr = err
			continue
		}
		result, err := c.post("renpho-aggregation/device/count", enc, true)
		if err != nil {
			lastErr = err
			continue
		}
		if err := checkResponse(result, "GetDeviceInfo"); err != nil {
			lastErr = err
			continue
		}
		data, err := decryptDataField(result)
		if err != nil {
			lastErr = err
			continue
		}
		if m, ok := data.(map[string]any); ok {
			return m, nil
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("device info failed")
}

func extractRecords(pageData any) []map[string]any {
	switch v := pageData.(type) {
	case []any:
		out := make([]map[string]any, 0, len(v))
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	case map[string]any:
		for _, key := range []string{"list", "data", "records", "measurements"} {
			if arr, ok := v[key].([]any); ok {
				return extractRecords(arr)
			}
		}
		if _, ok := v["weight"]; ok {
			return []map[string]any{v}
		}
	}
	return nil
}

func (c *Client) fetchPaged(endpoint, tableName string, userID string, pageSize int, stopOnCount int) ([]map[string]any, error) {
	all := make([]map[string]any, 0)
	page := 1
	for {
		req := map[string]any{
			"pageNum":   page,
			"pageSize":  pageSize,
			"userIds":   []string{userID},
			"tableName": tableName,
		}
		enc, err := encryptRequest(req)
		if err != nil {
			return nil, err
		}
		result, err := c.post(endpoint, enc, true)
		if err != nil {
			return nil, err
		}
		if err := checkResponse(result, endpoint); err != nil {
			return nil, err
		}
		if result["data"] == nil || result["data"] == "" {
			break
		}
		pageData, err := decryptDataField(result)
		if err != nil {
			return nil, err
		}
		recs := extractRecords(pageData)
		if len(recs) == 0 {
			break
		}
		all = append(all, recs...)
		if stopOnCount > 0 && len(all) >= stopOnCount {
			break
		}
		if len(recs) < pageSize {
			break
		}
		page++
		if page > 40 {
			break
		}
	}
	return all, nil
}

// AllMeasurements logs in (if needed) and returns newest-first measurements.
func (c *Client) AllMeasurements() ([]map[string]any, error) {
	if c.Token == "" {
		if err := c.Login(); err != nil {
			return nil, err
		}
	}
	info, err := c.deviceInfo()
	if err != nil {
		return nil, err
	}
	scales, _ := info["scale"].([]any)
	all := make([]map[string]any, 0)
	tablesTried := map[string]bool{}

	fetchTable := func(table, uid string, count int) error {
		if table == "" || tablesTried[table+"|"+uid] {
			return nil
		}
		tablesTried[table+"|"+uid] = true
		recs, err := c.fetchPaged("RenphoHealth/scale/queryBodyCompositionMeasureData", table, uid, 50, 0)
		if err != nil {
			return err
		}
		if len(recs) == 0 && count > 0 {
			recs, err = c.fetchPaged("RenphoHealth/scale/queryAllMeasureDataList", table, uid, 50, count)
			if err != nil {
				return err
			}
		}
		if len(recs) == 0 {
			// Count is often 0 for impedance scales even when data exists — try basic endpoint anyway.
			recs, err = c.fetchPaged("RenphoHealth/scale/queryAllMeasureDataList", table, uid, 50, 50)
			if err != nil {
				return err
			}
		}
		all = append(all, recs...)
		return nil
	}

	for _, s := range scales {
		scale, ok := s.(map[string]any)
		if !ok {
			continue
		}
		table, _ := scale["tableName"].(string)
		count := int(num(scale["count"]))
		uid := c.UserID
		if uids, ok := scale["userIds"].([]any); ok && len(uids) > 0 {
			matched := false
			for _, u := range uids {
				if idString(u) == c.UserID {
					matched = true
					break
				}
			}
			if !matched {
				uid = idString(uids[0])
			}
		}
		if err := fetchTable(table, uid, count); err != nil {
			return nil, err
		}
	}

	// Probe known shard tables when device info returned nothing useful.
	if len(all) == 0 {
		for i := 0; i < 16; i++ {
			table := fmt.Sprintf("measurements_info_%X", i)
			if err := fetchTable(table, c.UserID, 0); err != nil {
				return nil, err
			}
			if len(all) > 0 {
				break
			}
		}
	}

	if len(all) == 0 {
		return nil, fmt.Errorf("Renpho: logged in but no measurements found (scales=%d user=%s)", len(scales), c.UserID)
	}
	// newest first by timeStamp
	for i := 0; i < len(all); i++ {
		for j := i + 1; j < len(all); j++ {
			if num(all[j]["timeStamp"]) > num(all[i]["timeStamp"]) {
				all[i], all[j] = all[j], all[i]
			}
		}
	}
	return all, nil
}

func num(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	case string:
		var f float64
		fmt.Sscanf(strings.TrimSpace(t), "%f", &f)
		return f
	default:
		return 0
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// Num picks the first present numeric field.
func Num(m map[string]any, keys ...string) *float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			f := num(v)
			return &f
		}
	}
	return nil
}

func MeasurementTime(m map[string]any) string {
	keys := []string{"timeStamp", "timestamp", "timestampGMT", "createTime", "createdAt", "date", "calendarDate", "measureTime"}
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			if s := normalizeTime(v); s != "" {
				return s
			}
		}
	}
	return time.Now().UTC().Format(time.RFC3339)
}

func normalizeTime(v any) string {
	switch t := v.(type) {
	case float64:
		ts := t
		if ts > 1e12 {
			ts /= 1000
		}
		return time.Unix(int64(ts), 0).UTC().Format(time.RFC3339)
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return ""
		}
		if len(s) == 10 && s[4] == '-' && s[7] == '-' {
			return s + "T12:00:00Z"
		}
		s = strings.ReplaceAll(s, " ", "T")
		if strings.HasSuffix(s, "Z") || strings.Contains(s[10:], "+") || strings.Count(s[10:], "-") > 0 {
			return s
		}
		return s + "Z"
	default:
		return ""
	}
}
