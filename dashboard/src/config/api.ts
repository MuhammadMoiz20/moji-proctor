// API Configuration
// In production (Vercel), VITE_API_URL should point to your deployed server
// In development, use the Vite proxy (empty string uses relative paths)
export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

// Helper to construct full API URLs
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  
  if (!API_BASE_URL) {
    return cleanPath
  }
  
  // Remove trailing slash from base URL to avoid double slashes
  const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
  return `${baseUrl}${cleanPath}`
}
