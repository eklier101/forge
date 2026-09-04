package worker

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/eklier/forge/services/sync-worker/internal/api"
	"github.com/eklier/forge/services/sync-worker/internal/garmin"
	"github.com/eklier/forge/services/sync-worker/internal/renpho"
)

type Runner struct {
	API      *api.Client
	TZ       *time.Location
	Interval time.Duration
	Poll     time.Duration

	mu              sync.Mutex
	garminBackoff   map[string]time.Time
	garminHistoryAt map[string]time.Time
}

func New() *Runner {
	tzName := os.Getenv("FORGE_TZ")
	if tzName == "" {
		tzName = "America/New_York"
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		loc = time.FixedZone("UTC-4", -4*3600)
	}
	interval := envInt("SYNC_INTERVAL_SECONDS", 1800)
	poll := envInt("SYNC_POLL_SECONDS", 20)
	return &Runner{
		API:             api.NewFromEnv(),
		TZ:              loc,
		Interval:        time.Duration(interval) * time.Second,
		Poll:            time.Duration(poll) * time.Second,
		garminBackoff:   map[string]time.Time{},
		garminHistoryAt: map[string]time.Time{},
	}
}

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil || n <= 0 {
		return def
	}
	return n
}

func (r *Runner) LocalToday() string {
	return time.Now().In(r.TZ).Format("2006-01-02")
}

func (r *Runner) RunForever() {
	fmt.Printf("Forge sync-worker (Go) starting → %s interval=%ds poll=%ds\n",
		r.API.BaseURL, int(r.Interval.Seconds()), int(r.Poll.Seconds()))
	elapsed := r.Interval // run once on start
	for {
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					fmt.Printf("worker loop panic: %v\n", rec)
				}
			}()
			if api.WorkerKey() == "" {
				time.Sleep(r.Poll)
				return
			}
			_, hasForce, apiOK := r.API.FetchAccounts()
			if apiOK && (elapsed >= r.Interval || hasForce) {
				forceOnly := hasForce && elapsed < r.Interval
				r.LoopOnce(forceOnly)
				if elapsed >= r.Interval {
					elapsed = 0
				}
			}
		}()
		time.Sleep(r.Poll)
		elapsed += r.Poll
	}
}

func (r *Runner) LoopOnce(forceOnly bool) bool {
	if api.WorkerKey() == "" {
		fmt.Println("No JWT_SECRET or INTEGRATION_TOKEN — idle")
		return false
	}
	accounts, hasForce, apiOK := r.API.FetchAccounts()
	if !apiOK || len(accounts) == 0 {
		return false
	}
	ran := false
	for _, acct := range accounts {
		email, password := api.Creds(acct)
		force := api.HasForce(acct)
		if forceOnly && !force {
			continue
		}
		if acct.UserID == "" || email == "" || password == "" {
			continue
		}
		ran = true
		switch acct.Provider {
		case "garmin":
			r.syncGarmin(acct.UserID, email, password)
		case "renpho":
			r.syncRenpho(acct.UserID, email, password)
		}
	}
	return ran || hasForce
}

func (r *Runner) garminInBackoff(userID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	until, ok := r.garminBackoff[userID]
	return ok && time.Now().Before(until)
}

func (r *Runner) setGarminBackoff(userID string, d time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.garminBackoff[userID] = time.Now().Add(d)
}

func (r *Runner) syncGarmin(userID, email, password string) {
	if r.garminInBackoff(userID) {
		r.mu.Lock()
		until := r.garminBackoff[userID]
		r.mu.Unlock()
		fmt.Printf("garmin backoff user=%s wait=%ds\n", userID, int(time.Until(until).Seconds()))
		return
	}
	client := garmin.New(email, password)
	if err := client.Login(); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "429") || strings.Contains(strings.ToLower(msg), "rate limit") {
			r.setGarminBackoff(userID, time.Hour)
			r.API.ReportStatus("garmin", userID, false, "Garmin rate-limited (429) — backing off 1 hour", false)
			fmt.Println("garmin fail", userID, "429 backoff 1h")
			return
		}
		needs := strings.Contains(strings.ToLower(msg), "login") ||
			strings.Contains(strings.ToLower(msg), "auth") ||
			strings.Contains(strings.ToLower(msg), "credential") ||
			strings.Contains(strings.ToLower(msg), "mfa")
		fmt.Println("garmin fail", userID, msg)
		r.API.ReportStatus("garmin", userID, false, truncate(msg, 500), needs)
		return
	}

	today := r.LocalToday()
	stats, _ := client.DailyStats(today)
	sleepData, _ := client.Sleep(today)
	body, _ := client.BodyComposition(today)

	var steps *int
	var sleepMin *int
	var rhr *int
	var calories *float64
	var maxHR *int
	var stress, bodyBattery, floors, hrv, spo2, respiration, hydration, vo2, fitnessAge, readiness *float64
	var intensity *int

	if stats != nil {
		if n := garmin.MapNum(stats, "totalSteps"); n != nil {
			v := int(*n)
			if v > 0 {
				steps = &v
			}
		}
		if n := garmin.MapNum(stats, "restingHeartRate"); n != nil {
			v := int(*n)
			rhr = &v
		}
		calories = garmin.MapNum(stats, "totalKilocalories", "activeKilocalories")
		if n := garmin.MapNum(stats, "maxHeartRate"); n != nil {
			v := int(*n)
			maxHR = &v
		}
		stress = garmin.MapNum(stats, "averageStressLevel")
		bodyBattery = garmin.MapNum(stats, "bodyBatteryMostRecentValue", "bodyBatteryChargedValue")
		floors = garmin.MapNum(stats, "floorsAscended", "floorsClimbed")
		if n := garmin.MapNum(stats, "moderateIntensityMinutes"); n != nil {
			v := int(*n)
			intensity = &v
		}
		if n := garmin.MapNum(stats, "vigorousIntensityMinutes"); n != nil {
			v := int(*n)
			if intensity == nil {
				intensity = &v
			} else {
				sum := *intensity + v
				intensity = &sum
			}
		}
	}

	if sleepData != nil {
		daily := sleepData
		if nested, ok := sleepData["dailySleepDTO"].(map[string]any); ok {
			daily = nested
		}
		if n := garmin.MapNum(daily, "sleepTimeSeconds"); n != nil {
			v := int(*n) / 60
			if v > 0 {
				sleepMin = &v
			}
		}
		if rhr == nil {
			if n := garmin.MapNum(daily, "restingHeartRate"); n != nil {
				v := int(*n)
				rhr = &v
			}
		}
		hrv = garmin.MapNum(daily, "avgOvernightHrv", "hrv")
	}

	payload := map[string]any{
		"date":   today,
		"source": "garmin",
		"userId": userID,
	}
	if steps != nil {
		payload["steps"] = *steps
	}
	if sleepMin != nil {
		payload["sleepMinutes"] = *sleepMin
	}
	if rhr != nil {
		payload["restingHr"] = *rhr
	}
	if calories != nil {
		payload["calories"] = *calories
	}
	if maxHR != nil {
		payload["maxHr"] = *maxHR
	}
	if stress != nil {
		payload["stressAvg"] = *stress
	}
	if bodyBattery != nil {
		payload["bodyBattery"] = *bodyBattery
	}
	if floors != nil {
		payload["floors"] = *floors
	}
	if intensity != nil {
		payload["intensityMinutes"] = *intensity
	}
	if hrv != nil {
		payload["hrv"] = *hrv
	}
	if spo2 != nil {
		payload["spo2"] = *spo2
	}
	if respiration != nil {
		payload["respiration"] = *respiration
	}
	if hydration != nil {
		payload["hydrationMl"] = *hydration
	}
	if vo2 != nil {
		payload["vo2Max"] = *vo2
	}
	if fitnessAge != nil {
		payload["fitnessAge"] = *fitnessAge
	}
	if readiness != nil {
		payload["trainingReadiness"] = *readiness
	}

	if err := r.API.PostJSON("/integrations/garmin/daily/token", payload); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "429") {
			r.setGarminBackoff(userID, time.Hour)
		}
		fmt.Println("garmin fail", userID, msg)
		r.API.ReportStatus("garmin", userID, false, truncate(msg, 500), false)
		return
	}

	weightKG := garmin.MapNum(body, "weight", "weightKg")
	if weightKG != nil && *weightKG > 200 {
		v := *weightKG / 1000
		weightKG = &v
	}
	if weightKG != nil && *weightKG > 0 {
		w := map[string]any{
			"userId":    userID,
			"weight":    *weightKG,
			"units":     "kg",
			"weighedAt": garminWeightTime(body, today),
			"deviceId":  "garmin-worker",
			"source":    "garmin",
		}
		if n := garmin.MapNum(body, "bodyFat", "bodyFatPercentage"); n != nil {
			w["bodyFatPct"] = *n
		}
		if n := garmin.MapNum(body, "muscleMass"); n != nil {
			v := *n
			if v > 200 {
				v /= 1000
			}
			w["muscleMass"] = v
		}
		if n := garmin.MapNum(body, "boneMass"); n != nil {
			v := *n
			if v > 20 {
				v /= 1000
			}
			w["boneMass"] = v
		}
		if n := garmin.MapNum(body, "bmi"); n != nil {
			w["bmi"] = *n
		}
		if n := garmin.MapNum(body, "bodyWater", "bodyWaterPercentage"); n != nil {
			w["waterPct"] = *n
		}
		if err := r.API.PostJSON("/integrations/garmin/weight/token", w); err != nil {
			fmt.Printf("garmin weight ingest skipped: %v\n", err)
		}
	}

	if steps == nil && sleepMin == nil && calories == nil && rhr == nil && weightKG == nil {
		r.setGarminBackoff(userID, time.Hour)
		r.API.ReportStatus("garmin", userID, false, "Garmin returned no data (often rate-limit) — backing off 1 hour", false)
		fmt.Printf("garmin empty day=%s — backoff 1h\n", today)
		return
	}

	r.API.ReportStatus("garmin", userID, true, "", false)
	fmt.Printf("garmin ok user=%s day=%s steps=%s sleep=%s cal=%s bb=%s stress=%s\n",
		userID, today, fmtOptInt(steps), fmtOptInt(sleepMin), fmtOptFloat(calories), fmtOptFloat(bodyBattery), fmtOptFloat(stress))

	r.backfillGarminHistory(client, userID)
}

func fmtOptInt(v *int) string {
	if v == nil {
		return "None"
	}
	return fmt.Sprintf("%d", *v)
}

func fmtOptFloat(v *float64) string {
	if v == nil {
		return "None"
	}
	return fmt.Sprintf("%v", *v)
}

func garminWeightTime(body map[string]any, day string) string {
	if body == nil {
		return day + "T12:00:00Z"
	}
	for _, nestKey := range []string{"dateWeightList", "weightList"} {
		if arr, ok := body[nestKey].([]any); ok && len(arr) > 0 {
			if m, ok := arr[0].(map[string]any); ok {
				if s := renpho.MeasurementTime(m); s != "" {
					return s
				}
			}
		}
	}
	if s := renpho.MeasurementTime(body); s != "" {
		return s
	}
	return day + "T12:00:00Z"
}

func (r *Runner) backfillGarminHistory(client *garmin.Client, userID string) {
	r.mu.Lock()
	last := r.garminHistoryAt[userID]
	if time.Since(last) < 6*time.Hour {
		r.mu.Unlock()
		return
	}
	r.garminHistoryAt[userID] = time.Now()
	r.mu.Unlock()

	posted := 0
	days := 14
	for i := 1; i <= days; i++ {
		if r.garminInBackoff(userID) {
			fmt.Printf("garmin history abort (backoff) user=%s\n", userID)
			break
		}
		day := time.Now().In(r.TZ).AddDate(0, 0, -i).Format("2006-01-02")
		stats, err := client.DailyStats(day)
		if err != nil && strings.Contains(err.Error(), "429") {
			r.setGarminBackoff(userID, time.Hour)
			break
		}
		sleepData, _ := client.Sleep(day)
		payload := map[string]any{"date": day, "source": "garmin", "userId": userID}
		if n := garmin.MapNum(stats, "totalSteps"); n != nil && *n > 0 {
			payload["steps"] = int(*n)
		}
		if n := garmin.MapNum(stats, "restingHeartRate"); n != nil {
			payload["restingHr"] = int(*n)
		}
		if n := garmin.MapNum(stats, "totalKilocalories", "activeKilocalories"); n != nil {
			payload["calories"] = *n
		}
		if sleepData != nil {
			daily := sleepData
			if nested, ok := sleepData["dailySleepDTO"].(map[string]any); ok {
				daily = nested
			}
			if n := garmin.MapNum(daily, "sleepTimeSeconds"); n != nil {
				v := int(*n) / 60
				if v > 0 {
					payload["sleepMinutes"] = v
				}
			}
		}
		if len(payload) <= 3 {
			continue
		}
		if err := r.API.PostJSON("/integrations/garmin/daily/token", payload); err == nil {
			posted++
		}
		time.Sleep(600 * time.Millisecond)
	}
	fmt.Printf("garmin history user=%s posted=%d/%d\n", userID, posted, days)
}

func (r *Runner) syncRenpho(userID, email, password string) {
	client := renpho.New(email, password)
	if err := client.Login(); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "104") || strings.Contains(strings.ToLower(msg), "wrong") {
			msg = "Renpho rejected login (wrong email/password). Use Renpho Health app credentials — usually 6–16 letters/numbers. Not the renpho.com website account."
		}
		needs := strings.Contains(strings.ToLower(msg), "login") ||
			strings.Contains(strings.ToLower(msg), "auth") ||
			strings.Contains(strings.ToLower(msg), "password") ||
			strings.Contains(msg, "401") || strings.Contains(msg, "104")
		fmt.Println("renpho fail", userID, msg)
		r.API.ReportStatus("renpho", userID, false, truncate(msg, 500), needs)
		return
	}
	measurements, err := client.AllMeasurements()
	if err != nil {
		fmt.Println("renpho fail", userID, err.Error())
		r.API.ReportStatus("renpho", userID, false, truncate(err.Error(), 500), false)
		return
	}
	recent := measurements
	if len(recent) > 45 {
		recent = recent[:45]
	}
	// oldest → newest so last write is newest
	for i, j := 0, len(recent)-1; i < j; i, j = i+1, j-1 {
		recent[i], recent[j] = recent[j], recent[i]
	}
	posted := 0
	var latest map[string]any
	for _, m := range recent {
		payload := renphoPayload(userID, m)
		if payload["weight"] == nil {
			continue
		}
		if err := r.API.PostJSON("/integrations/renpho/weight/token", payload); err != nil {
			fmt.Println("renpho fail", userID, err.Error())
			r.API.ReportStatus("renpho", userID, false, truncate(err.Error(), 500), false)
			return
		}
		posted++
		latest = payload
	}
	r.API.ReportStatus("renpho", userID, true, "", false)
	fmt.Printf("renpho ok user=%s posted=%d weight=%vkg fat=%v\n", userID, posted, latest["weight"], latest["bodyFatPct"])
}

func renphoPayload(userID string, latest map[string]any) map[string]any {
	weight := renpho.Num(latest, "weight")
	if weight == nil {
		return map[string]any{}
	}
	muscleRaw := renpho.Num(latest, "muscle", "muscleMass", "muscle_mass")
	muscleMass := renpho.Num(latest, "sinew", "leanMass")
	var musclePct *float64
	if muscleRaw != nil {
		if *muscleRaw <= 80 {
			musclePct = muscleRaw
		} else if muscleMass == nil {
			muscleMass = muscleRaw
		}
	}
	payload := map[string]any{
		"userId":    userID,
		"weight":    *weight,
		"units":     "kg",
		"weighedAt": renpho.MeasurementTime(latest),
		"deviceId":  "renpho-worker",
	}
	if n := renpho.Num(latest, "bodyfat", "bodyFat", "body_fat"); n != nil {
		payload["bodyFatPct"] = *n
	}
	if muscleMass != nil {
		payload["muscleMass"] = *muscleMass
	}
	if musclePct != nil {
		payload["musclePct"] = *musclePct
	}
	if n := renpho.Num(latest, "bone", "boneMass", "bone_mass"); n != nil {
		payload["boneMass"] = *n
	}
	if n := renpho.Num(latest, "water", "waterPct", "bodywater"); n != nil {
		payload["waterPct"] = *n
	}
	if n := renpho.Num(latest, "bmi"); n != nil {
		payload["bmi"] = *n
	}
	if n := renpho.Num(latest, "visfat", "visceralFat", "visceral"); n != nil {
		payload["visceralFat"] = *n
	}
	if n := renpho.Num(latest, "subfat", "subcutaneousFat"); n != nil {
		payload["subcutaneousFatPct"] = *n
	}
	if n := renpho.Num(latest, "protein"); n != nil {
		payload["proteinPct"] = *n
	}
	if n := renpho.Num(latest, "bodyage", "bodyAge", "metabolicAge"); n != nil {
		payload["bodyAge"] = *n
	}
	if n := renpho.Num(latest, "bmr"); n != nil {
		payload["bmr"] = *n
	}
	if n := renpho.Num(latest, "sinew", "leanMass"); n != nil {
		payload["leanMass"] = *n
	}
	if n := renpho.Num(latest, "fatFreeWeight", "fat_free_weight"); n != nil {
		payload["fatFreeWeight"] = *n
	}
	if n := renpho.Num(latest, "heartRate", "heartrate", "hr"); n != nil {
		payload["heartRate"] = *n
	}
	if n := renpho.Num(latest, "cardiacIndex", "cardiac_index"); n != nil {
		payload["cardiacIndex"] = *n
	}
	if v := latest["bodyShape"]; v != nil {
		payload["bodyShape"] = v
	} else if v := latest["bodyshape"]; v != nil {
		payload["bodyShape"] = v
	}
	return payload
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
