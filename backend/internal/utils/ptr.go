package utils

func DerefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func DerefInt(i *int) int {
	if i == nil {
		return 0
	}
	return *i
}

func DerefFloat(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

func DerefBool(b *bool) bool {
	if b == nil {
		return false
	}
	return *b
}

func StrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
