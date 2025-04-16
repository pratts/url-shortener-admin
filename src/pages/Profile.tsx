import React, { useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
} from '@mui/material';
import { getProfile } from '../services/api';
import type { UserProfile } from '../types';

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await getProfile();
        setProfile(data);
      } catch (err) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ mt: 4 }}>
          <Typography color="error">{error}</Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Profile
        </Typography>
        <Paper sx={{ p: 3 }}>
          <List>
            <ListItem>
              <ListItemText
                primary="Name"
                secondary={profile?.name || 'Not provided'}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Email"
                secondary={profile?.email || 'Not provided'}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Verification Status"
                secondary={
                  <Chip
                    label={profile?.verified ? 'Verified' : 'Not Verified'}
                    color={profile?.verified ? 'success' : 'warning'}
                    size="small"
                  />
                }
              />
            </ListItem>
          </List>
        </Paper>
      </Box>
    </Container>
  );
};

export default Profile; 