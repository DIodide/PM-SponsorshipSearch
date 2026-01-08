Project Leads: Yubi Mamiya, Ibraheem Amin

# Setup
```bash
npm install turbo --global
cd packages/backend
npx convex login
# Select the playmaker-sponsorship-search team after joining it.
```

Now from the root:
```bash
turbo dev
```

This should start two things, the convex dev environment at packages/backend,
and the web ui at apps/web


# For the scraper to work on `turbo dev`
```
chmod +x .../PM-SponsorshipSearch/apps/scraper/backend/dev.sh
```