# Moji Proctor Instructor Dashboard

A modern React-based dashboard for instructors to view and analyze student activity and results.

## Features

- 🔐 **GitHub OAuth Authentication** - Secure login using GitHub Device Flow
- 📊 **Assignment Overview** - View all assignments with signal counts
- 📈 **Assignment Analytics** - Detailed statistics and summaries per assignment
- 👥 **Student Management** - View all students enrolled in assignments
- 📝 **Activity Timeline** - Detailed timeline of student signals and events
- 🎨 **Modern UI** - Clean, intuitive interface built with React and Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Running Moji Proctor server (see `../server/README.md`)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure the server URL (if different from default):
   - The dashboard proxies API requests to `http://localhost:3000` by default
   - Modify `vite.config.ts` if your server runs on a different port

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory. You can serve them with any static file server.

## Usage

1. **Login**: Click "Sign in with GitHub" and follow the device flow instructions
2. **View Assignments**: Browse all assignments on the home page
3. **Assignment Details**: Click an assignment to see:
   - Summary statistics (total signals, students, sessions)
   - Breakdown by signal type
   - Time range of activity
   - List of all students
4. **Student Timeline**: Click a student to view their detailed activity timeline with filtering options

## Project Structure

```
dashboard/
├── src/
│   ├── components/      # Reusable UI components
│   ├── contexts/         # React contexts (Auth)
│   ├── pages/           # Page components
│   ├── routes/           # Routing configuration
│   ├── services/        # API service functions
│   └── utils/           # Utility functions
├── public/              # Static assets
└── dist/                # Build output
```

## API Integration

The dashboard communicates with the Moji Proctor server API:

- `GET /api/instructor/assignments` - List all assignments
- `GET /api/instructor/assignments/:id/students` - Get students for an assignment
- `GET /api/instructor/assignments/:id/summary` - Get assignment summary
- `GET /api/instructor/assignments/:id/students/:studentId/timeline` - Get student timeline

All requests require authentication via JWT tokens obtained through the GitHub OAuth Device Flow.

## Development

- Uses Vite for fast development and building
- TypeScript for type safety
- Tailwind CSS for styling
- React Router for navigation
- Lucide React for icons

## License

Same as the main Moji Proctor project.
