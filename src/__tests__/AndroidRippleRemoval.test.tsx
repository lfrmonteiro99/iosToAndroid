import fs from 'fs';
import path from 'path';

/**
 * Test suite for issue #494: Remove android_ripple from 7 locations
 *
 * This test verifies that:
 * 1. android_ripple is completely removed from src/
 * 2. Each affected location has alternative visual feedback on press
 */

describe('Issue #494: Android Ripple Removal', () => {
  describe('android_ripple prop removal', () => {
    it('should have zero android_ripple occurrences in src/', () => {
      const srcDir = path.join(__dirname, '../../src');

      // Recursively scan all TypeScript/TSX files
      let rippleCount = 0;
      const filesWithRipple: string[] = [];

      function scanDir(dir: string) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip node_modules and .next
            if (!file.startsWith('.') && file !== 'node_modules') {
              scanDir(fullPath);
            }
          } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const matches = content.match(/android_ripple\s*=/g);
            if (matches) {
              rippleCount += matches.length;
              filesWithRipple.push(fullPath);
            }
          }
        }
      }

      scanDir(srcDir);

      expect(rippleCount).toBe(0);
      expect(filesWithRipple).toEqual([]);
    });

    it('should still have zero TouchableNativeFeedback in src/', () => {
      const srcDir = path.join(__dirname, '../../src');

      let count = 0;
      const filesWithTouchable: string[] = [];

      function scanDir(dir: string) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            if (!file.startsWith('.') && file !== 'node_modules' && file !== '__tests__') {
              scanDir(fullPath);
            }
          } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const matches = content.match(/TouchableNativeFeedback|TouchableHighlight/g);
            if (matches) {
              count += matches.length;
              filesWithTouchable.push(fullPath);
            }
          }
        }
      }

      scanDir(srcDir);

      expect(count).toBe(0);
      expect(filesWithTouchable).toEqual([]);
    });
  });

  describe('visual feedback on affected components', () => {
    it('LauncherHomeScreen app icon should maintain pressScale feedback', () => {
      const filePath = path.join(__dirname, '../screens/LauncherHomeScreen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // App icon should have pressScale animation
      const appIconSection = content.substring(
        content.indexOf('function AppIcon'),
        content.indexOf('function AppIcon') + 3000
      );

      expect(appIconSection).toContain('pressScale');
      expect(appIconSection).toContain('withSpring(0.85');
      expect(appIconSection).toContain('handlePressIn');
      expect(appIconSection).toContain('handlePressOut');
    });

    it('LauncherHomeScreen folder icon should have opacity feedback', () => {
      const filePath = path.join(__dirname, '../screens/LauncherHomeScreen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Folder icon component should have style-based feedback
      const folderSection = content.substring(
        content.indexOf('function FolderIcon'),
        content.indexOf('function FolderIcon') + 1500
      );

      // Should have a style prop with pressed state handling
      expect(folderSection).toMatch(/style.*pressed/);
    });

    it('LauncherHomeScreen default launcher button should have opacity feedback', () => {
      const filePath = path.join(__dirname, '../screens/LauncherHomeScreen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Set as default button should have style feedback
      const defaultBannerSection = content.substring(
        content.indexOf('Set as default launcher'),
        content.indexOf('Set as default launcher') + 500
      );

      // Should have a style prop with pressed state handling
      expect(defaultBannerSection).toMatch(/style.*pressed/);
    });

    it('CallScreen control button should have opacity feedback', () => {
      const filePath = path.join(__dirname, '../screens/CallScreen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // ControlButton component should have style feedback
      const controlBtnSection = content.substring(
        content.indexOf('function ControlButton'),
        content.indexOf('function ControlButton') + 1000
      );

      // Should have a style prop with pressed state handling
      expect(controlBtnSection).toMatch(/style.*pressed/);
    });

    it('CallScreen end call button should have opacity feedback', () => {
      const filePath = path.join(__dirname, '../screens/CallScreen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // End call button should have style feedback
      // Find the comment that precedes it, then find the Pressable after that
      const commentIndex = content.lastIndexOf('End Call button');
      const pressableStart = content.indexOf('<Pressable', commentIndex);
      const endCallSection = content.substring(pressableStart, pressableStart + 400);

      // Should have a style prop with pressed state handling
      expect(endCallSection).toMatch(/style.*pressed/);
    });

    it('AssistiveTouch menu cell should have opacity feedback', () => {
      const filePath = path.join(__dirname, '../components/AssistiveTouch.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Menu cell should have style feedback
      const pressableStart = content.indexOf('<Pressable', content.indexOf('items.map'));
      const menuCellSection = content.substring(pressableStart, pressableStart + 500);

      // Should have a style prop with pressed state handling
      expect(menuCellSection).toMatch(/style.*pressed/);
    });

    it('TodayViewScreen widget card should have opacity feedback', () => {
      const filePath = path.join(__dirname, '../screens/TodayViewScreen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Widget card pressable should have style feedback
      const widgetSection = content.substring(
        content.indexOf('widgetCard'),
        content.indexOf('widgetCard') + 1500
      );

      // Should have a style prop with pressed state handling
      expect(widgetSection).toMatch(/style.*pressed/);
    });
  });
});
