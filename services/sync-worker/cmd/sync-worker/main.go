package main

import "github.com/eklier/forge/services/sync-worker/internal/worker"

func main() {
	worker.New().RunForever()
}
