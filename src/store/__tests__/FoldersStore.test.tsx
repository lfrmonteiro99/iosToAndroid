import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FoldersProvider, useFolders } from '../FoldersStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FoldersProvider>{children}</FoldersProvider>
);

let dateNowCounter = 1000000;

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  // Ensure each createFolder call gets a unique id
  jest.spyOn(Date, 'now').mockImplementation(() => ++dateNowCounter);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FoldersStore', () => {
  it('starts with empty folders', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    expect(result.current.folders).toHaveLength(0);
    expect(result.current.isReady).toBe(true);
  });

  it('createFolder() creates a folder with given name and apps', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createFolder('Games', ['com.game.one', 'com.game.two']);
    });

    expect(result.current.folders).toHaveLength(1);
    const folder = result.current.folders[0];
    expect(folder.name).toBe('Games');
    expect(folder.apps).toEqual(['com.game.one', 'com.game.two']);
    expect(folder.id).toBeTruthy();
    expect(folder.color).toBeTruthy();
  });

  it('addToFolder() adds an app to an existing folder', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createFolder('Games', ['com.game.one', 'com.game.two']);
    });

    const folderId = result.current.folders[0].id;

    await act(async () => {
      result.current.addToFolder(folderId, 'com.game.three');
    });

    expect(result.current.folders[0].apps).toHaveLength(3);
    expect(result.current.folders[0].apps).toContain('com.game.three');
  });

  it('addToFolder() does not add duplicate apps', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createFolder('Work', ['com.work.app']);
    });

    const folderId = result.current.folders[0].id;

    await act(async () => {
      result.current.addToFolder(folderId, 'com.work.app');
    });

    expect(result.current.folders[0].apps).toHaveLength(1);
  });

  it('removeFromFolder() removes an app from a folder', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createFolder('Games', ['com.game.one', 'com.game.two', 'com.game.three']);
    });

    const folderId = result.current.folders[0].id;

    await act(async () => {
      result.current.removeFromFolder(folderId, 'com.game.two');
    });

    expect(result.current.folders[0].apps).toHaveLength(2);
    expect(result.current.folders[0].apps).not.toContain('com.game.two');
  });

  it('deleteFolder() removes the folder entirely', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createFolder('Games', ['com.game.one', 'com.game.two']);
    });

    const folderId = result.current.folders[0].id;

    await act(async () => {
      result.current.deleteFolder(folderId);
    });

    expect(result.current.folders).toHaveLength(0);
  });

  it('auto-deletes a folder when its last app is removed', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createFolder('Solo', ['com.only.app']);
    });

    expect(result.current.folders).toHaveLength(1);
    const folderId = result.current.folders[0].id;

    await act(async () => {
      result.current.removeFromFolder(folderId, 'com.only.app');
    });

    expect(result.current.folders).toHaveLength(0);
  });

  it('getFolderForApp() returns the correct folder for a given package name', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createFolder('Productivity', ['com.office.word', 'com.office.excel']);
      result.current.createFolder('Games', ['com.game.chess']);
    });

    const found = result.current.getFolderForApp('com.office.excel');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Productivity');
  });

  it('getFolderForApp() returns undefined for an app not in any folder', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.createFolder('Games', ['com.game.one']);
    });

    expect(result.current.getFolderForApp('com.not.in.any.folder')).toBeUndefined();
  });

  it('persists folders to AsyncStorage on change', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      result.current.createFolder('Social', ['com.social.app']);
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@iostoandroid/folders',
      expect.stringContaining('Social'),
    );
  });

  it('hydrates folders from AsyncStorage on mount', async () => {
    const saved = JSON.stringify([
      { id: 'saved-1', name: 'Saved Folder', apps: ['com.saved.app'], color: '#007AFF' },
    ]);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    expect(result.current.folders).toHaveLength(1);
    expect(result.current.folders[0].name).toBe('Saved Folder');
    expect(result.current.isReady).toBe(true);
  });

  it('migrates legacy @folders key to @iostoandroid/folders on mount', async () => {
    const legacy = JSON.stringify([
      { id: 'legacy-1', name: 'Legacy Folder', apps: ['com.legacy.app'], color: '#34C759' },
    ]);
    // Simulate: legacy key has data, new key is empty
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === '@folders') return Promise.resolve(legacy);
      if (key === '@iostoandroid/folders') return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    // After migration the new key is written with legacy data and legacy key removed
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@iostoandroid/folders', legacy);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@folders');
    expect(result.current.folders).toHaveLength(1);
    expect(result.current.folders[0].name).toBe('Legacy Folder');
  });

  it('multiple folders can coexist independently', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper });
    await act(async () => {});

    // Create each folder in its own act to guarantee distinct Date.now() ids
    await act(async () => { result.current.createFolder('Games', ['com.game.one']); });
    await act(async () => { result.current.createFolder('Work', ['com.work.one']); });
    await act(async () => { result.current.createFolder('Social', ['com.social.one']); });

    expect(result.current.folders).toHaveLength(3);

    const workFolder = result.current.folders.find((f) => f.name === 'Work');
    expect(workFolder).toBeDefined();

    // Delete only Work
    await act(async () => {
      result.current.deleteFolder(workFolder!.id);
    });

    expect(result.current.folders).toHaveLength(2);
    expect(result.current.folders.find((f) => f.name === 'Work')).toBeUndefined();
    expect(result.current.folders.find((f) => f.name === 'Games')).toBeDefined();
  });
});
