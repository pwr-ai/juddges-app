'use client';

import { useEffect, useState } from 'react';
import { UserProfile } from '@/types/user_profile';

export default function ProfileList() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = async () => {
    try {
      const response = await fetch('/api/profiles');
      if (!response.ok) {
        throw new Error('Failed to fetch profiles');
      }
      const data = await response.json();
      setProfiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/profiles?id=${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete profile');
      }
      
      await fetchProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <div>Loading profiles...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Profiles</h1>
      <div className="space-y-4">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="p-4 border rounded hover:bg-gray-50"
          >
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold mb-2">{profile.name}</h2>
                <p className="text-gray-600 mb-2">{profile.email}</p>
              </div>
              <button
                onClick={() => handleDelete(profile.id)}
                className="text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>

            <div className="mt-3 text-sm text-gray-500">
              <span>Created: {formatDate(profile.createdAt)}</span>
              <span className="mx-2">•</span>
              <span>Updated: {formatDate(profile.updatedAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 