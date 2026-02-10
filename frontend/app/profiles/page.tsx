'use client';

import { useState, useEffect } from 'react';
import { UserProfile, CreateUserProfile } from '@/types/user_profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState<CreateUserProfile>({
    name: '',
    email: '',
  });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      const response = await fetch('/api/profiles');
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fetch profiles error:', errorText);
        throw new Error(`Failed to fetch profiles: ${errorText}`);
      }
      const data = await response.json();
      setProfiles(data);
    } catch (err) {
      console.error('Error in fetchProfiles:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      toast.error('Failed to fetch profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Create profile error:', errorText);
        throw new Error(`Failed to create profile: ${errorText}`);
      }

      await response.json();
      await fetchProfiles();
      setIsCreateDialogOpen(false);
      setFormData({ name: '', email: '' });
      toast.success('Profile created successfully');
    } catch (err) {
      console.error('Error in handleCreate:', err);
      toast.error('Failed to create profile');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) {
      console.error('No profile selected for update');
      return;
    }

    try {
      const response = await fetch(`/api/profiles?id=${selectedProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Update profile error:', errorText);
        throw new Error(`Failed to update profile: ${errorText}`);
      }

      await response.json();
      await fetchProfiles();
      setIsEditDialogOpen(false);
      setSelectedProfile(null);
      setFormData({ name: '', email: '' });
      toast.success('Profile updated successfully');
    } catch (err) {
      console.error('Error in handleUpdate:', err);
      toast.error('Failed to update profile');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/profiles?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Delete profile error:', errorText);
        throw new Error(`Failed to delete profile: ${errorText}`);
      }

      await response.json();
      await fetchProfiles();
      toast.success('Profile deleted successfully');
    } catch (err) {
      console.error('Error in handleDelete:', err);
      toast.error('Failed to delete profile');
    }
  };

  const openEditDialog = (profile: UserProfile) => {
    setSelectedProfile(profile);
    setFormData({
      name: profile.name,
      email: profile.email,
    });
    setIsEditDialogOpen(true);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1200px]">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Profiles</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add Profile</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Profile</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <Button type="submit">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {profiles.map((profile) => (
          <div key={profile.id} className="p-4 border rounded-lg">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">{profile.name}</h2>
                <p className="text-gray-600">{profile.email}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => openEditDialog(profile)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(profile.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <Button type="submit">Update</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
