export interface NoteRequest {
  noteId?: string;
  content?: string;
  password?: string;
  newPassword?: string;
  action?: string;
}

export interface NoteResponse {
  success: boolean;
  noteId?: string;
  error?: string;
  content?: string;
  passwordProtected?: boolean;
}
