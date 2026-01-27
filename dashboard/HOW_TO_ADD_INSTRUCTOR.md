# How to Add Your GitHub Account to INSTRUCTOR_ALLOWLIST

## Step 1: Find Your GitHub Username

Your GitHub username is the part after `https://github.com/` in your profile URL.

For example:
- If your profile is `https://github.com/johndoe`, your username is `johndoe`
- If your profile is `https://github.com/moiz123`, your username is `moiz123`

You can also find it by:
1. Going to https://github.com
2. Clicking your profile picture (top right)
3. Your username is shown under your name

## Step 2: Edit the server/.env File

Open `/home/moiz/Dev/moji-proctor/server/.env` and find this line:

```
INSTRUCTOR_ALLOWLIST=""
```

Replace it with your GitHub username:

```
INSTRUCTOR_ALLOWLIST="your-github-username"
```

**Example:**
If your GitHub username is `moiz`, change it to:
```
INSTRUCTOR_ALLOWLIST="moiz"
```

**For multiple instructors:**
```
INSTRUCTOR_ALLOWLIST="moiz,professor123,ta456"
```

## Step 3: Restart the Server

After saving the file, restart your server:

```bash
# Stop the current server (Ctrl+C)
# Then restart it:
cd server
npm run dev
```

## Step 4: Log Out and Log Back In

If you've already logged into the dashboard:
1. Log out from the dashboard
2. Log back in with GitHub
3. Your account will now have instructor role

**Note:** The role is assigned when you first log in. If you were already logged in before adding yourself to the allowlist, you need to log out and log back in for the role to be assigned.

## Verify It Works

After logging back in, you should be able to:
- See the assignments list
- View student data
- Access all instructor features

If you still see errors, check:
- Your GitHub username is spelled correctly (case-sensitive)
- The server was restarted after changing the .env file
- You logged out and logged back in
