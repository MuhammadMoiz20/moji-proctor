# Troubleshooting Dashboard Issues

## Common Issues and Solutions

### "Failed to load assignments" Error

If you see this error, check the following:

1. **Server is Running**
   - Make sure the server is running on port 3000
   - Check: `curl http://localhost:3000/health` should return `{"status":"ok"}`

2. **Authentication**
   - Make sure you're logged in (check browser localStorage for `accessToken`)
   - If not logged in, go to `/login` and authenticate with GitHub
   - Your GitHub account must be in the `INSTRUCTOR_ALLOWLIST` in the server `.env`

3. **CORS Configuration**
   - The server `.env` should have `CORS_ORIGIN="http://localhost:5173"` for development
   - Restart the server after changing CORS_ORIGIN

4. **Database Connection**
   - Verify the `DATABASE_URL` in server `.env` is correct
   - Check server logs for database connection errors

5. **Instructor Role**
   - Add your GitHub username to `INSTRUCTOR_ALLOWLIST` in server `.env`
   - Format: `INSTRUCTOR_ALLOWLIST="your-github-username"`
   - Restart the server after adding yourself

### Network Errors

If you see "Network error: Cannot connect to server":
- Verify the server is running: `cd server && npm run dev`
- Check the server is listening on port 3000
- Verify no firewall is blocking localhost:3000

### 401 Unauthorized Errors

- Your access token may have expired
- Try logging out and logging back in
- Check browser console for detailed error messages

### 403 Forbidden Errors

- Your GitHub account is not in the instructor allowlist
- Add your username to `INSTRUCTOR_ALLOWLIST` in server `.env`
- Restart the server

### Empty Assignments List

- This is normal if no students have submitted signals yet
- The dashboard only shows assignments that have signal data

## Quick Debug Steps

1. Open browser DevTools (F12)
2. Check the Console tab for error messages
3. Check the Network tab to see API request/response details
4. Verify the request URL is correct: `/api/instructor/assignments`
5. Check the response status code and body

## Server Logs

Check server terminal output for:
- Database connection errors
- Authentication errors
- CORS errors
- Route registration messages
