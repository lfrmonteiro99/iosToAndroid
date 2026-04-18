import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@iostoandroid/folders';

export interface AppFolder {
  id: string;
  name: string;
  apps: string[]; // package names
  color: string;
}

interface FoldersContextValue {
  folders: AppFolder[];
  createFolder: (name: string, apps: string[]) => void;
  renameFolder: (id: string, name: string) => void;
  addToFolder: (folderId: string, packageName: string) => void;
  removeFromFolder: (folderId: string, packageName: string) => void;
  deleteFolder: (id: string) => void;
  getFolderForApp: (packageName: string) => AppFolder | undefined;
  isReady: boolean;
}

const FOLDER_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D55', '#5856D6'];

const FoldersContext = createContext<FoldersContextValue | null>(null);

export function FoldersProvider({ children }: { children: React.ReactNode }) {
  const [folders, setFolders] = useState<AppFolder[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try { setFolders(JSON.parse(stored)); } catch (e) { logger.warn('FoldersStore', 'failed to parse stored folders', e); }
      }
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  }, [folders, isReady]);

  const createFolder = useCallback((name: string, apps: string[]) => {
    setFolders(prev => [...prev, {
      id: Date.now().toString(),
      name,
      apps,
      color: FOLDER_COLORS[prev.length % FOLDER_COLORS.length],
    }]);
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  }, []);

  const addToFolder = useCallback((folderId: string, packageName: string) => {
    setFolders(prev => prev.map(f =>
      f.id === folderId && !f.apps.includes(packageName)
        ? { ...f, apps: [...f.apps, packageName] }
        : f
    ));
  }, []);

  const removeFromFolder = useCallback((folderId: string, packageName: string) => {
    setFolders(prev => prev.map(f =>
      f.id === folderId ? { ...f, apps: f.apps.filter(p => p !== packageName) } : f
    ).filter(f => f.apps.length > 0)); // auto-delete empty folders
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
  }, []);

  const getFolderForApp = useCallback((packageName: string) => {
    return folders.find(f => f.apps.includes(packageName));
  }, [folders]);

  const value = useMemo(() => ({
    folders, createFolder, renameFolder, addToFolder, removeFromFolder, deleteFolder, getFolderForApp, isReady,
  }), [folders, createFolder, renameFolder, addToFolder, removeFromFolder, deleteFolder, getFolderForApp, isReady]);

  return <FoldersContext.Provider value={value}>{children}</FoldersContext.Provider>;
}

export function useFolders() {
  const ctx = useContext(FoldersContext);
  if (!ctx) throw new Error('useFolders must be used within FoldersProvider');
  return ctx;
}
