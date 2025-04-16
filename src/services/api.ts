import axios from 'axios';
import { User } from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8086/api/v1';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests if it exists
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const login = async (userData: User) => {
    const response = await api.post('/users/login', userData);
    return response.data;
};

export const getProfile = async () => {
    const response = await api.get('/users/me');
    return response.data;
};

export const getUrls = async () => {
    const response = await api.get('/urls');
    return response.data;
};

export const getUrlById = async (id: string) => {
    const response = await api.get(`/urls/${id}`);
    return response.data;
};

export const createUrl = async (longUrl: string) => {
    const response = await api.post('/urls', { url: longUrl });
    return response.data;
};

export const updateUrl = async (id: string, longUrl: string) => {
    const response = await api.put(`/urls/${id}`, { url: longUrl });
    return response.data;
}; 