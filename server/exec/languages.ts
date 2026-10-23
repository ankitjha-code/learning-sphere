import type { ExecLanguage } from './index';

export const ALL_LANGUAGES: ExecLanguage[] = ['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'rust'];

export const LANGUAGE_LABELS: Record<ExecLanguage | 'sql', string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  go: 'Go',
  rust: 'Rust',
  sql: 'SQL (PostgreSQL)',
};

/**
 * Docker sandbox recipes. Each runs as one container per submission: the source is
 * written to /tmp (the only writable path), compiled once, then every test runs with
 * its own timeout. Images are official Docker Hub images.
 */
export type DockerRecipe = {
  image: string;
  file: string; // source file name inside /tmp/src
  compile?: string; // shell command run once in /tmp/src
  run: string; // shell command run per test in /tmp/src
  compileTimeoutSec: number;
  env?: Record<string, string>;
};

export const DOCKER_RECIPES: Partial<Record<ExecLanguage, DockerRecipe>> = {
  python: { image: 'python:3.13-alpine', file: 'main.py', run: 'python3 -B main.py', compileTimeoutSec: 5, env: { PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' } },
  c: { image: 'gcc:14', file: 'main.c', compile: 'gcc -O2 -std=c17 -o main main.c -lm', run: './main', compileTimeoutSec: 30 },
  cpp: { image: 'gcc:14', file: 'main.cpp', compile: 'g++ -O2 -std=c++20 -o main main.cpp', run: './main', compileTimeoutSec: 45 },
  java: {
    image: 'eclipse-temurin:21-jdk-alpine',
    file: 'Main.java',
    compile: 'javac -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 -J-Xss8m Main.java',
    run: 'java -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss64m -cp . Main',
    compileTimeoutSec: 45,
  },
  go: { image: 'golang:1.23-alpine', file: 'main.go', compile: 'go build -o main main.go', run: './main', compileTimeoutSec: 90, env: { GOCACHE: '/tmp/gocache', GOPATH: '/tmp/gopath', GOFLAGS: '-mod=mod', CGO_ENABLED: '0', GOTOOLCHAIN: 'local' } },
  rust: { image: 'rust:1-alpine', file: 'main.rs', compile: 'rustc -O --edition 2021 -o main main.rs', run: './main', compileTimeoutSec: 60 },
};

/** Judge0 CE language ids (stable ids from the public CE instance). */
export const JUDGE0_LANGUAGE_IDS: Partial<Record<ExecLanguage, number>> = {
  python: 71, // Python 3.8.1
  javascript: 63, // Node.js 12.14.0
  typescript: 74, // TypeScript 3.7.4
  java: 62, // OpenJDK 13.0.1 (class must be Main)
  cpp: 54, // GCC 9.2.0
  c: 50, // GCC 9.2.0
  go: 60, // Go 1.13.5
  rust: 73, // Rust 1.40.0
};
