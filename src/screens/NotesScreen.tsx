import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  StyleSheet,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoSearchBar,
  CupertinoSwipeableRow,
  useAlert,
} from '../components';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = '@iostoandroid/notes';
const DEBOUNCE_MS = 500;
const NOTES_ACCENT = '#FFD60A';

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function formatNoteDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }) + ' at ' + date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNoteTitle(note: Note): string {
  return note.title.trim() || 'New Note';
}

function getNotePreview(note: Note): string {
  const body = note.body.trim();
  if (!body) return 'No additional text';
  const firstLine = body.split('\n')[0];
  return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;
}

// ─── Note Row ───────────────────────────────────────────────────────────────

interface NoteRowProps {
  note: Note;
  onPress: () => void;
  onDelete: () => void;
  colors: any;
  typography: any;
}

const NoteRow = React.memo(function NoteRow({
  note,
  onPress,
  onDelete,
  colors,
  typography,
}: NoteRowProps) {
  return (
    <CupertinoSwipeableRow
      trailingActions={[
        {
          label: 'Delete',
          color: colors.systemRed,
          onPress: onDelete,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.noteRow,
          {
            backgroundColor: pressed
              ? colors.systemGray5
              : colors.secondarySystemGroupedBackground,
          },
        ]}
      >
        <View style={[styles.noteRowContent, { borderBottomColor: colors.separator }]}>
          <Text
            style={[typography.headline, { color: colors.label }]}
            numberOfLines={1}
          >
            {getNoteTitle(note)}
          </Text>
          <View style={styles.noteRowSubline}>
            <Text
              style={[typography.footnote, { color: colors.secondaryLabel, marginRight: 8 }]}
            >
              {formatNoteDate(note.updatedAt)}
            </Text>
            <Text
              style={[typography.footnote, { color: colors.secondaryLabel, flex: 1 }]}
              numberOfLines={1}
            >
              {getNotePreview(note)}
            </Text>
          </View>
        </View>
      </Pressable>
    </CupertinoSwipeableRow>
  );
});

// ─── Main Screen ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function NotesScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const alert = useAlert();

  // ── State ───────────────────────────────────────────────────
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // Editor state
  const [editorTitle, setEditorTitle] = useState('');
  const [editorBody, setEditorBody] = useState('');
  const bodyRef = useRef<TextInput>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Persistence ─────────────────────────────────────────────

  const loadNotes = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Note[] = JSON.parse(raw);
        setNotes(parsed.sort((a, b) => b.updatedAt - a.updatedAt));
      }
    } catch {
      // silently fail
    }
    setLoaded(true);
  }, []);

  const persistNotes = useCallback(async (updated: Note[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // ── Filtered Notes ──────────────────────────────────────────

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q),
    );
  }, [notes, searchQuery]);

  // ── Note Actions ────────────────────────────────────────────

  const createNote = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const now = Date.now();
    const newNote: Note = {
      id: generateId(),
      title: '',
      body: '',
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    persistNotes(updated);
    setEditorTitle('');
    setEditorBody('');
    setEditingNote(newNote);
  }, [notes, persistNotes]);

  const openNote = useCallback((note: Note) => {
    setEditorTitle(note.title);
    setEditorBody(note.body);
    setEditingNote(note);
  }, []);

  const deleteNote = useCallback(
    (noteId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const updated = notes.filter((n) => n.id !== noteId);
      setNotes(updated);
      persistNotes(updated);
      if (editingNote?.id === noteId) {
        setEditingNote(null);
      }
    },
    [notes, persistNotes, editingNote],
  );

  const confirmDelete = useCallback(
    (noteId: string) => {
      alert('Delete Note', 'Are you sure you want to delete this note?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteNote(noteId),
        },
      ]);
    },
    [alert, deleteNote],
  );

  // ── Auto-save (debounced) ───────────────────────────────────

  const saveEdit = useCallback(
    (title: string, body: string) => {
      if (!editingNote) return;
      const now = Date.now();
      const updatedNote: Note = {
        ...editingNote,
        title,
        body,
        updatedAt: now,
      };
      setEditingNote(updatedNote);
      setNotes((prev) => {
        const updated = prev.map((n) => (n.id === updatedNote.id ? updatedNote : n));
        updated.sort((a, b) => b.updatedAt - a.updatedAt);
        persistNotes(updated);
        return updated;
      });
    },
    [editingNote, persistNotes],
  );

  const debouncedSave = useCallback(
    (title: string, body: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveEdit(title, body), DEBOUNCE_MS);
    },
    [saveEdit],
  );

  const handleTitleChange = useCallback(
    (text: string) => {
      setEditorTitle(text);
      debouncedSave(text, editorBody);
    },
    [debouncedSave, editorBody],
  );

  const handleBodyChange = useCallback(
    (text: string) => {
      setEditorBody(text);
      debouncedSave(editorTitle, text);
    },
    [debouncedSave, editorTitle],
  );

  const handleBack = useCallback(() => {
    // Flush any pending save immediately
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (editingNote) {
      saveEdit(editorTitle, editorBody);
    }
    // Remove empty notes
    if (editingNote && !editorTitle.trim() && !editorBody.trim()) {
      const updated = notes.filter((n) => n.id !== editingNote.id);
      setNotes(updated);
      persistNotes(updated);
    }
    Keyboard.dismiss();
    setEditingNote(null);
  }, [editingNote, editorTitle, editorBody, notes, persistNotes, saveEdit]);

  const handleShare = useCallback(() => {
    alert('Share', 'Sharing is not available in the emulator.');
  }, [alert]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // ── Render: Editor View ─────────────────────────────────────

  if (editingNote) {
    return (
      <View style={[styles.container, { backgroundColor: colors.systemBackground }]}>
        {/* Editor Nav Bar */}
        <CupertinoNavigationBar
          title=""
          largeTitle={false}
          leftButton={
            <Pressable onPress={handleBack} style={styles.navButton} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={NOTES_ACCENT} />
              <Text style={[typography.body, { color: NOTES_ACCENT }]}>Notes</Text>
            </Pressable>
          }
          rightButton={
            <View style={styles.editorNavRight}>
              <Pressable onPress={handleShare} hitSlop={8}>
                <Ionicons name="share-outline" size={22} color={NOTES_ACCENT} />
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(editingNote.id)}
                hitSlop={8}
                style={{ marginLeft: 20 }}
              >
                <Ionicons name="trash-outline" size={22} color={NOTES_ACCENT} />
              </Pressable>
              <Pressable
                onPress={() => Keyboard.dismiss()}
                hitSlop={8}
                style={{ marginLeft: 20 }}
              >
                <Text style={[typography.body, { color: NOTES_ACCENT, fontWeight: '600' }]}>
                  Done
                </Text>
              </Pressable>
            </View>
          }
        />

        <KeyboardAvoidingView
          style={styles.editorContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* Last edited date */}
          <Text
            style={[
              typography.footnote,
              styles.editorDate,
              { color: colors.secondaryLabel },
            ]}
          >
            {formatFullDate(editingNote.updatedAt)}
          </Text>

          {/* Title field */}
          <TextInput
            style={[
              typography.title1,
              styles.editorTitle,
              { color: colors.label },
            ]}
            value={editorTitle}
            onChangeText={handleTitleChange}
            placeholder="Title"
            placeholderTextColor={colors.tertiaryLabel}
            multiline
            scrollEnabled={false}
            returnKeyType="next"
            blurOnSubmit
            onSubmitEditing={() => bodyRef.current?.focus()}
          />

          {/* Body text area */}
          <TextInput
            ref={bodyRef}
            style={[
              typography.body,
              styles.editorBody,
              { color: colors.label },
            ]}
            value={editorBody}
            onChangeText={handleBodyChange}
            placeholder="Start typing..."
            placeholderTextColor={colors.tertiaryLabel}
            multiline
            textAlignVertical="top"
            scrollEnabled
          />
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Render: List View ───────────────────────────────────────

  const renderNoteRow = ({ item }: { item: Note }) => (
    <NoteRow
      note={item}
      onPress={() => openNote(item)}
      onDelete={() => confirmDelete(item.id)}
      colors={colors}
      typography={typography}
    />
  );

  const keyExtractor = (item: Note) => item.id;

  const renderEmptyState = () => {
    if (!loaded) return null;
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name="document-text-outline"
          size={64}
          color={colors.systemGray3}
          style={styles.emptyIcon}
        />
        <Text style={[typography.title3, { color: colors.secondaryLabel, marginBottom: 8 }]}>
          No Notes
        </Text>
        <Text
          style={[
            typography.subhead,
            { color: colors.tertiaryLabel, textAlign: 'center', paddingHorizontal: 40 },
          ]}
        >
          Tap the compose button to create your first note.
        </Text>
      </View>
    );
  };

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      {/* Search bar */}
      <View style={[styles.searchContainer, { paddingHorizontal: spacing.md }]}>
        <CupertinoSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
        />
      </View>

      {/* Section header */}
      {filteredNotes.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text
            style={[
              typography.title3,
              { color: colors.label, fontWeight: '700' },
            ]}
          >
            All Notes
          </Text>
          <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
            {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Notes"
        largeTitle={false}
        leftButton={
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={NOTES_ACCENT} />
          </Pressable>
        }
        rightButton={
          <Pressable onPress={createNote} hitSlop={8}>
            <Ionicons name="create-outline" size={24} color={NOTES_ACCENT} />
          </Pressable>
        }
      />

      <FlatList
        data={filteredNotes}
        renderItem={renderNoteRow}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 90,
          flexGrow: filteredNotes.length === 0 ? 1 : undefined,
        }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />

      {/* Floating New Note button (iOS Notes style bottom toolbar) */}
      <View
        style={[
          styles.bottomToolbar,
          {
            paddingBottom: insets.bottom + 8,
            borderTopColor: colors.separator,
            backgroundColor: colors.systemGroupedBackground,
          },
        ]}
      >
        <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
          {notes.length} {notes.length === 1 ? 'Note' : 'Notes'}
        </Text>
        <Pressable onPress={createNote} hitSlop={8}>
          <Ionicons name="create-outline" size={24} color={NOTES_ACCENT} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // List view
  listHeader: {
    marginBottom: 4,
  },
  searchContainer: {
    paddingVertical: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  noteRow: {
    paddingLeft: 16,
  },
  noteRowContent: {
    paddingVertical: 12,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  noteRowSubline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    marginBottom: 16,
  },

  // Bottom toolbar
  bottomToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Editor view
  editorContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  editorDate: {
    textAlign: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  editorTitle: {
    paddingVertical: 0,
    marginBottom: 12,
  },
  editorBody: {
    flex: 1,
    paddingVertical: 0,
    paddingBottom: 40,
  },
  editorNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
