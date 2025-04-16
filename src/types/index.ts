export interface User {
    email: string;
    password: string;
}

export interface UserProfile {
    id: number;
    email: string;
    verified: boolean;
    name: string;
}

export interface Url {
    id: string;
    url: string;
    short_url: string;
    created_at: string;
    updated_at: string;
}

export interface LoginResponse {
    token: string;
    id: string;
    name: string;
} 