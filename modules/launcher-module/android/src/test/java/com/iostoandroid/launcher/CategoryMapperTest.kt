package com.iostoandroid.launcher

import android.content.pm.ApplicationInfo
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pure-JVM unit tests for [CategoryMapper] — tests the mapping of
 * ApplicationInfo.category integer constants to stable string labels.
 */
class CategoryMapperTest {

    @Test
    fun `maps all defined ApplicationInfo category constants to stable strings`() {
        assertEquals("undefined", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_UNDEFINED))
        assertEquals("game", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_GAME))
        assertEquals("audio", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_AUDIO))
        assertEquals("video", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_VIDEO))
        assertEquals("image", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_IMAGE))
        assertEquals("social", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_SOCIAL))
        assertEquals("news", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_NEWS))
        assertEquals("maps", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_MAPS))
        assertEquals("productivity", CategoryMapper.categoryToString(ApplicationInfo.CATEGORY_PRODUCTIVITY))
    }

    @Test
    fun `maps CATEGORY_ACCESSIBILITY value to accessibility string`() {
        // CATEGORY_ACCESSIBILITY is API 31+ and has value 8
        assertEquals("accessibility", CategoryMapper.categoryToString(8))
    }

    @Test
    fun `maps unknown values to undefined`() {
        assertEquals("undefined", CategoryMapper.categoryToString(999))
        assertEquals("undefined", CategoryMapper.categoryToString(-999))
    }

    @Test
    fun `isCategoryReadable is false below API 26, where the field does not exist`() {
        // minSdkVersion 24: estes dois SAO dispositivos suportados por este modulo.
        assertEquals(false, CategoryMapper.isCategoryReadable(24))
        assertEquals(false, CategoryMapper.isCategoryReadable(25))
    }

    @Test
    fun `isCategoryReadable is true from API 26 up`() {
        assertEquals(true, CategoryMapper.isCategoryReadable(26)) // O — fronteira
        assertEquals(true, CategoryMapper.isCategoryReadable(31))
        assertEquals(true, CategoryMapper.isCategoryReadable(35))
    }

    @Test
    fun `handles negative values gracefully`() {
        // Only CATEGORY_UNDEFINED is -1; others should map to "undefined"
        assertEquals("undefined", CategoryMapper.categoryToString(-2))
        assertEquals("undefined", CategoryMapper.categoryToString(-100))
    }
}
