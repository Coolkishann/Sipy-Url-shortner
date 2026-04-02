🧾 Product Requirements Document — URL Shortener
📌 Problem Statement

Develop a scalable, high-performance URL shortening service that generates short links and redirects users efficiently with low latency (<100ms) and high availability (99.9%).

🎯 Goals
Generate short URLs
Fast redirection (<100ms)
Handle high traffic (10k req/sec)
Scalable architecture
Fault tolerance
📊 Success Metrics
Metric	Target
Latency	< 100ms
Throughput	10k req/sec
Uptime	99.9%
Error rate	< 0.1%
👤 User Stories
Developer creates short URL
User clicks short URL → redirect
Admin monitors health
System handles high traffic
Failover when server down
⚙️ Functional Requirements
1. Create Short URL
POST /shorten

Request:

{
  "url": "https://example.com"
}

Response:

{
  "shortUrl": "http://short.ly/abc123"
}
2. Redirect URL
GET /:shortId

Flow:

Check Redis
If miss → check PostgreSQL
Redirect
3. Health Check
GET /health

Return:

200 OK
⚡ Non-Functional Requirements
Performance
Latency < 100ms
10k requests/sec
Scalability
Horizontal scaling
Multiple API servers
Reliability
Failover
Health checks
Security
Validate URLs
Prevent abuse
🧠 System Design Architecture
Client
  ↓
Load Balancer
  ↓
API Servers (Multiple)
  ↓
Redis Cache
  ↓
PostgreSQL
🧰 Tech Stack
Backend
Node.js
Fastify
TypeScript
Load Balancer
Custom Node.js Load Balancer
Database
PostgreSQL
Cache
Redis
Containerization
Docker
Docker Compose
ID Generator
NanoID
📁 High Level Services
services:
- load-balancer
- api-server
- redis
- postgres