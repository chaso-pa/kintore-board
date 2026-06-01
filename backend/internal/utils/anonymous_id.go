package utils

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
)

func GenerateAnonymousThreadID(userID, threadID, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(userID + ":" + threadID))
	return hex.EncodeToString(mac.Sum(nil))[:8]
}
