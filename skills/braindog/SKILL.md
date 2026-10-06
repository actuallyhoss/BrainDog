---
name: braindog
description: Read and write the person's BrainDog record, the shared memory of their work, projects, money and decisions that every agent they use reads. Reach for it when you start work, when you need what was decided or what leads, and whenever they mention their record, a task, a decision, a figure or a key.
---

# BrainDog

BrainDog is one person's record: their work, projects, money and decisions, shared by every agent they use.

## Connect

- **In any app that takes an MCP address:** add `https://brain.dog/mcp`, or the self-hosted address they give you.
  The app opens a sign-in and the person allows it in BrainDog, so no token is copied anywhere.
- **On their machine:** `braindog setup https://brain.dog/app/<slug>` signs in, adds the hooks and this skill, and
  registers `braindog mcp`, which serves the record with the sign-in the command keeps.
- **From a script:** a token they make in the app, or with `braindog token create --scope read|propose|write`, in the
  `Authorization` header:

  ```json
  { "type": "http", "url": "https://brain.dog/mcp", "headers": { "Authorization": "Bearer <token>" } }
  ```

Never put a token in a row, a note, a commit or a message.

## Then

Call `context` first. It names your run and your project, gives you the next step, and says what applies here. The
server's instructions carry the rules you keep.

Meet everyone you work with or are told about with `meet`, and give their email or handle when you have one.
