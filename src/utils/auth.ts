import {jwtDecode} from 'jwt-decode';

interface JwtPayload {
    id: string;
    name: string;
    email: string;
    birthday?: string;
    exp: number;
}

export const getToken = (): string | null => {
    return document.cookie
        .split('; ')
        .find(row => row.startsWith('token='))
        ?.split('=')[1] || null;
};

export const isTokenValid = (): boolean => {
    const token = getToken();
    if (!token) return false;

    try {
        const decoded = jwtDecode<JwtPayload>(token);
        return decoded.exp * 1000 > Date.now();
    } catch {
        return false;
    }
};

export const getUserFromToken = (): JwtPayload | null => {
    const token = getToken();
    if (!token) return null;

    try {
        return jwtDecode<JwtPayload>(token);
    } catch {
        return null;
    }
};

export const clearAuth = (): void => {
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
};