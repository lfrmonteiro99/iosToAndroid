import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useDevice } from '../store/DeviceStore';
import { CupertinoNavigationBar } from '../components';
import type { AppNavigationProp } from '../navigation/types';

interface ForecastDay {
  date: string;
  high: number;
  low: number;
  icon: string;
}

interface HourlyEntry {
  time: string;
  temp: number;
  icon: string;
}

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  sunny: 'sunny',
  'partly-sunny': 'partly-sunny',
  cloud: 'cloud',
  rainy: 'rainy',
  thunderstorm: 'thunderstorm',
  snow: 'snow',
};

function WeatherIcon({ name, size = 24 }: { name: string; size?: number }) {
  const ionName = ICON_MAP[name] || 'cloud';
  return <Ionicons name={ionName} size={size} color="#fff" />;
}

interface WeatherScreenProps {
  navigation: AppNavigationProp;
}

export function WeatherScreen({ navigation }: WeatherScreenProps) {
  const insets = useSafeAreaInsets();
  const device = useDevice();
  const { weather } = device;

  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [hourly, setHourly] = useState<HourlyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [humidity, setHumidity] = useState('—');
  const [wind, setWind] = useState('—');
  const [feelsLike, setFeelsLike] = useState('—');
  const [uv, setUv] = useState('—');
  const [currentTemp, setCurrentTemp] = useState<number | null>(null);
  const [currentCity, setCurrentCity] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Request location permission here (non-blocking for the rest of the app)
        let locationQuery = '';
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            locationQuery = `${loc.coords.latitude.toFixed(4)},${loc.coords.longitude.toFixed(4)}`;
          }
        } catch { /* fall back to IP geolocation */ }

        const url = locationQuery
          ? `https://wttr.in/${locationQuery}?format=j1`
          : 'https://wttr.in/?format=j1';
        const res = await fetch(url);
        const data = await res.json();
        const current = data.current_condition[0];
        const area = data.nearest_area?.[0];
        setCurrentTemp(parseInt(current.temp_C, 10));
        setCurrentCity(area?.areaName?.[0]?.value ?? '');
        setHumidity(`${current.humidity}%`);
        setWind(`${current.windspeedKmph} km/h`);
        setFeelsLike(`${current.FeelsLikeC}°`);
        setUv(current.uvIndex);

        // Hourly from today
        const todayHours = data.weather?.[0]?.hourly ?? [];
        const hrs: HourlyEntry[] = todayHours.slice(0, 8).map((h: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const hour = parseInt(h.time, 10) / 100;
          const suffix = hour >= 12 ? 'PM' : 'AM';
          const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
          const code = parseInt(h.weatherCode, 10);
          let icon = 'cloud';
          if (code <= 113) icon = 'sunny';
          else if (code <= 116) icon = 'partly-sunny';
          else if (code <= 143) icon = 'cloud';
          else if (code <= 299) icon = 'rainy';
          else if (code <= 338) icon = 'snow';
          else icon = 'thunderstorm';
          return { time: `${display}${suffix}`, temp: parseInt(h.tempC, 10), icon };
        });
        setHourly(hrs);

        // 5-day forecast
        const days: ForecastDay[] = (data.weather ?? []).slice(0, 5).map((d: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const dateStr = d.date;
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dt = new Date(dateStr + 'T00:00:00');
          // Derive icon from average weather code of hourly data
          const avgCode = d.hourly?.length
            ? d.hourly.reduce((sum: number, h: any) => sum + parseInt(h.weatherCode, 10), 0) / d.hourly.length // eslint-disable-line @typescript-eslint/no-explicit-any
            : 116;
          let dayIcon = 'cloud';
          if (avgCode <= 113) dayIcon = 'sunny';
          else if (avgCode <= 116) dayIcon = 'partly-sunny';
          else if (avgCode <= 119) dayIcon = 'cloud';
          else if (avgCode <= 143) dayIcon = 'cloud';
          else if (avgCode <= 299) dayIcon = 'rainy';
          else if (avgCode <= 338) dayIcon = 'snow';
          else dayIcon = 'thunderstorm';
          return {
            date: dayNames[dt.getDay()],
            high: parseInt(d.maxtempC, 10),
            low: parseInt(d.mintempC, 10),
            icon: dayIcon,
          };
        });
        setForecast(days);
      } catch { /* use device weather fallback */ }
      setLoading(false);
    })();
  }, []);

  if (loading && currentTemp === null) {
    return (
      <LinearGradient colors={['#2C5F8A', '#1B3A5C']} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#2C5F8A', '#1B3A5C']}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <CupertinoNavigationBar
        title=""
        leftButton={
          <Ionicons name="chevron-back" size={28} color="#fff" onPress={() => navigation.goBack()} />
        }
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
        {/* City & current temp */}
        <View style={styles.hero}>
          <Text style={styles.cityName}>{currentCity || weather.city || 'My Location'}</Text>
          <Text style={styles.bigTemp}>{currentTemp ?? weather.temp}°</Text>
          <Text style={styles.condition}>{weather.condition}</Text>
          {forecast.length > 0 && (
            <Text style={styles.highLow}>
              H:{forecast[0].high}° L:{forecast[0].low}°
            </Text>
          )}
        </View>

        {/* Hourly forecast */}
        {hourly.length > 0 && (
          <View style={styles.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyRow}>
              {hourly.map((h, i) => (
                <View key={i} style={styles.hourlyItem}>
                  <Text style={styles.hourlyTime}>{h.time}</Text>
                  <WeatherIcon name={h.icon} size={22} />
                  <Text style={styles.hourlyTemp}>{h.temp}°</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Multi-day forecast */}
        {forecast.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.6)" />
              <Text style={styles.cardHeaderText}>5-DAY FORECAST</Text>
            </View>
            {forecast.map((d, i) => (
              <View key={i} style={styles.forecastRow}>
                <Text style={styles.forecastDay}>{i === 0 ? 'Today' : d.date}</Text>
                <WeatherIcon name={d.icon} size={20} />
                <Text style={styles.forecastLow}>{d.low}°</Text>
                <View style={styles.tempBar} />
                <Text style={styles.forecastHigh}>{d.high}°</Text>
              </View>
            ))}
          </View>
        )}

        {/* Details grid */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailCard}>
            <Ionicons name="water-outline" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={styles.detailLabel}>HUMIDITY</Text>
            <Text style={styles.detailValue}>{humidity}</Text>
          </View>
          <View style={styles.detailCard}>
            <Ionicons name="speedometer-outline" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={styles.detailLabel}>WIND</Text>
            <Text style={styles.detailValue}>{wind}</Text>
          </View>
          <View style={styles.detailCard}>
            <Ionicons name="thermometer-outline" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={styles.detailLabel}>FEELS LIKE</Text>
            <Text style={styles.detailValue}>{feelsLike}</Text>
          </View>
          <View style={styles.detailCard}>
            <Ionicons name="sunny-outline" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={styles.detailLabel}>UV INDEX</Text>
            <Text style={styles.detailValue}>{uv}</Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16 },
  hero: { alignItems: 'center', marginBottom: 24 },
  cityName: { color: '#fff', fontSize: 34, fontWeight: '300', letterSpacing: 0.5 },
  bigTemp: { color: '#fff', fontSize: 96, fontWeight: '100', lineHeight: 110 },
  condition: { color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: '400' },
  highLow: { color: 'rgba(255,255,255,0.7)', fontSize: 16, marginTop: 4 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardHeaderText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

  hourlyRow: { flexDirection: 'row', gap: 20, paddingHorizontal: 4 },
  hourlyItem: { alignItems: 'center', gap: 6 },
  hourlyTime: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
  hourlyTemp: { color: '#fff', fontSize: 17, fontWeight: '500' },

  forecastRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.15)' },
  forecastDay: { color: '#fff', fontSize: 17, fontWeight: '500', width: 60 },
  forecastLow: { color: 'rgba(255,255,255,0.5)', fontSize: 17, marginLeft: 12, width: 30, textAlign: 'right' },
  tempBar: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginHorizontal: 8 },
  forecastHigh: { color: '#fff', fontSize: 17, width: 30 },

  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  detailCard: { width: '47%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 14, gap: 4 },
  detailLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  detailValue: { color: '#fff', fontSize: 28, fontWeight: '300' },
});
