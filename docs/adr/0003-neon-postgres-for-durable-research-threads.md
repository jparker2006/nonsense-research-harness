---
status: accepted
---

# Use Neon Postgres for durable Research Threads

Research Threads and their bounded Topic Research Workspaces will be stored in a small Neon Postgres database through a thin server-side `ThreadStore`, because the eventual Vercel runtime cannot treat process memory or local SQLite as durable state. The first version will use direct serverless Postgres access and a deliberately small schema rather than an ORM, vector database, event store, cross-topic knowledge graph, or provider-native model-history store.
