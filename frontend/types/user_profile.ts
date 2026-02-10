export interface UserProfile {
    id: string;
    email: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }
  
  export interface CreateUserProfile {
    email: string;
    name: string;
  }
  
  export interface UpdateUserProfile {
    email?: string;
    name?: string;
  } 