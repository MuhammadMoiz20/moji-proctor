import { useAuth } from '../contexts/AuthContext'

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem('accessToken')

  if (!token) {
    throw new Error('No access token found. Please log in again.')
  }

  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  // If unauthorized, try to refresh token
  if (response.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken')
    if (refreshToken) {
      try {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })

        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          localStorage.setItem('accessToken', data.access_token)
          localStorage.setItem('refreshToken', data.refresh_token)

          // Retry original request with new token
          response = await fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              Authorization: `Bearer ${data.access_token}`,
              'Content-Type': 'application/json',
            },
          })
        } else {
          // Refresh failed, user needs to log in again
          throw new Error('Session expired. Please log in again.')
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error
        }
        throw new Error('Failed to refresh token. Please log in again.')
      }
    } else {
      throw new Error('No refresh token found. Please log in again.')
    }
  }

  return response
}

export function useApi() {
  const { accessToken, refreshAccessToken } = useAuth()

  return {
    fetchWithAuth: async (url: string, options: RequestInit = {}) => {
      if (!accessToken) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.status === 401) {
        await refreshAccessToken()
        // Retry with new token
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json',
          },
        })
      }

      return response
    },
  }
}
