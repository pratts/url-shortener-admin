import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
} from '@mui/material';
import {
  ContentCopy as ContentCopyIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { getUrls, createUrl, updateUrl } from '../services/api';
import { Url } from '../types';

const UrlsList: React.FC = () => {
  const [urls, setUrls] = useState<Url[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUrl, setEditingUrl] = useState<Url | null>(null);
  const [editUrl, setEditUrl] = useState('');

  useEffect(() => {
    fetchUrls();
  }, []);

  const fetchUrls = async () => {
    try {
      const data = await getUrls();
      setUrls(data);
    } catch (error) {
      console.error('Error fetching URLs:', error);
    }
  };

  const handleCreateUrl = async () => {
    try {
      await createUrl(newUrl);
      setNewUrl('');
      fetchUrls();
    } catch (error) {
      console.error('Error creating URL:', error);
    }
  };

  const handleUpdateUrl = async () => {
    if (!editingUrl) return;
    try {
      await updateUrl(editingUrl.id, editUrl);
      setEditingUrl(null);
      setEditUrl('');
      fetchUrls();
    } catch (error) {
      console.error('Error updating URL:', error);
    }
  };

  const handleCopyToClipboard = (shortUrl: string) => {
    navigator.clipboard.writeText(`${shortUrl}`);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          URL Management
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
          <TextField
            fullWidth
            label="Long URL"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Enter URL to shorten"
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreateUrl}
            disabled={!newUrl}
          >
            Create
          </Button>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Long URL</TableCell>
                <TableCell>Short URL</TableCell>
                <TableCell>Created At</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {urls.map((url) => (
                <TableRow key={url.id}>
                  <TableCell>{url.url}</TableCell>
                  <TableCell>{url.short_url}</TableCell>
                  <TableCell>
                    {new Date(url.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      onClick={() => handleCopyToClipboard(url.short_url)}
                      title="Copy to clipboard"
                    >
                      <ContentCopyIcon />
                    </IconButton>
                    {/* <IconButton
                      onClick={() => {
                        setEditingUrl(url);
                        setEditUrl(url.url);
                        setOpenDialog(true);
                      }}
                      title="Edit URL"
                    >
                      <EditIcon />
                    </IconButton> */}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
        <DialogTitle>Edit URL</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Long URL"
            fullWidth
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleUpdateUrl} color="primary">
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default UrlsList; 