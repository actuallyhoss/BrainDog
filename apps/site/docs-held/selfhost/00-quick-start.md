# Run it yourself

BrainDog can run on your own machine, free, with no account with us. One container and one volume.

```steps
Clone and copy the settings | Clone the repository, then copy selfhost.env.example to .env | In a terminal
Set two lines | BRAINDOG_OWNER is your email and BRAINDOG_TOKEN is the server key | In .env
Start it | docker compose up -d --build | In a terminal
Open the link | The log ends with a one-time link. Open it and add a passkey | In the log
```

Mail, a model and a public address are each off until you set them, and the server says so in one line when it starts. Backups and restore, and every setting, are in `apps/selfhost/README.md` in the repository.
