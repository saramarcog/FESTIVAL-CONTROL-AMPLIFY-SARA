import React, { useMemo, useState, useEffect } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, Pressable, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { initialEvents, FestivalEvent, EventStatus } from './src/data';
import { theme as c } from './src/theme';
import { api, BackendStatus } from './src/api';

type Page = 'dashboard' | 'events' | 'form';
const stages = ['MAIN STAGE', 'GARDEN', 'WAREHOUSE', 'RIVER STAGE'];
const statuses: EventStatus[] = ['CONFIRMED', 'DELAYED', 'CANCELLED'];

function Action({ label, onPress, secondary = false, danger = false, disabled = false }: {
  label: string; 
  onPress: () => void; 
  secondary?: boolean; 
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable 
      accessibilityRole="button" 
      disabled={disabled}
      onPress={onPress} 
      style={({pressed}) => [
        s.button, 
        secondary && s.buttonSecondary, 
        danger && s.buttonDanger, 
        disabled && { opacity: 0.5 },
        pressed && !disabled && { opacity: 0.75 }
      ]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Status({value}: {value: EventStatus}) {
  const color = value === 'CONFIRMED' ? c.green : value === 'DELAYED' ? c.amber : c.red;
  return <Text style={[s.status, {color}]}>● {value}</Text>;
}

function EventCard({event, onEdit, onStatus, onDelete}: {
  event: FestivalEvent; 
  onEdit: () => void; 
  onStatus: () => void; 
  onDelete: () => void;
}) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.time}>{event.time}</Text>
        <Status value={event.status}/>
      </View>
      <Text style={s.artist}>{event.artist}</Text>
      <Text style={s.space}>{event.space} · {event.id}</Text>
      <View style={s.cardActions}>
        <Pressable accessibilityRole="button" onPress={onEdit}>
          <Text style={s.actionText}>EDITAR</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onStatus}>
          <Text style={s.actionText}>CAMBIAR ESTADO</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDelete}>
          <Text style={[s.actionText, {color: c.red}]}>ELIMINAR</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  const {width} = useWindowDimensions();
  const wide = width > 860;
  const [page, setPage] = useState<Page>('dashboard');
  const [events, setEvents] = useState<FestivalEvent[]>(initialEvents);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('TODOS');
  const [editing, setEditing] = useState<string | null>(null);
  const [artist, setArtist] = useState('');
  const [space, setSpace] = useState(stages[0]);
  const [time, setTime] = useState('21:45');
  const [status, setStatus] = useState<EventStatus>('CONFIRMED');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);

  // Sincronizar eventos y comprobar salud del backend
  const loadEvents = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [remoteEvents, health] = await Promise.all([
        api.getEvents(),
        api.checkHealth()
      ]);
      setEvents(remoteEvents);
      setBackendStatus(health);
    } catch {
      // Si el backend no responde, intentamos al menos verificar salud
      const health = await api.checkHealth();
      setBackendStatus(health);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const filtered = useMemo(() => 
    events.filter(e => 
      (filter === 'TODOS' || e.space === filter) && 
      (e.artist.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase()))
    ),
    [events, search, filter]
  );

  const openNew = () => {
    setEditing(null);
    setArtist('');
    setSpace(stages[0]);
    setTime('21:45');
    setStatus('CONFIRMED');
    setNotice('');
    setPage('form');
  };

  const openEdit = (e: FestivalEvent) => {
    setEditing(e.id);
    setArtist(e.artist);
    setSpace(e.space);
    setTime(e.time);
    setStatus(e.status);
    setNotice('');
    setPage('form');
  };

  const save = async () => {
    if (!artist.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setNotice('⚠️ Introduce un artista y una hora válida (HH:MM).');
      return;
    }

    setLoading(true);
    try {
      if (editing) {
        await api.updateEvent(editing, {
          artist: artist.trim().toUpperCase(),
          space,
          time,
          status
        });
        setNotice('✅ Evento actualizado y persistido en DynamoDB.');
      } else {
        await api.createEvent({
          artist: artist.trim().toUpperCase(),
          space,
          time,
          status
        });
        setNotice('✅ Evento creado con éxito y guardado en DynamoDB.');
      }
      await loadEvents(true);
      setPage('events');
    } catch {
      // Fallback local en caso de desconexión momentánea
      if (editing) {
        setEvents(v => v.map(e => e.id === editing ? { ...e, artist: artist.trim().toUpperCase(), space, time, status } : e));
        setNotice('⚠️ Evento actualizado localmente (servidor no disponible).');
      } else {
        const id = 'EVT-' + Date.now().toString().slice(-7);
        setEvents(v => [{ id, artist: artist.trim().toUpperCase(), space, time, status }, ...v]);
        setNotice('⚠️ Evento creado en modo local (inicia npm run server para persistir en DynamoDB).');
      }
      setPage('events');
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (id: string) => {
    try {
      await api.toggleStatus(id);
      await loadEvents(true);
      setNotice('✅ Estado actualizado en DynamoDB.');
    } catch {
      // Fallback local
      setEvents(v => v.map(e => e.id === id ? {
        ...e,
        status: e.status === 'CONFIRMED' ? 'DELAYED' : e.status === 'DELAYED' ? 'CANCELLED' : 'CONFIRMED'
      } : e));
      setNotice('Estado actualizado en memoria local.');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteEvent(id);
      await loadEvents(true);
      setNotice('✅ Evento eliminado de DynamoDB.');
    } catch {
      setEvents(v => v.filter(e => e.id !== id));
      setNotice('Evento eliminado localmente.');
    }
  };

  const confirmed = events.filter(e => e.status === 'CONFIRMED').length;
  const delayed = events.filter(e => e.status === 'DELAYED').length;

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={[s.container, wide && {maxWidth: 1160, alignSelf: 'center', width: '100%'}]}>
        
        {/* Cabecera Principal */}
        <View style={s.header}>
          <View>
            <Text style={s.brand}>
              FESTIVAL CONTROL<Text style={{color: c.pink}}> /</Text>
            </Text>
            <Text style={s.kicker}>LIVE OPERATIONS · AWS SERVERLESS</Text>
          </View>
          
          <View style={s.badgeContainer}>
            {backendStatus?.connected ? (
              <View style={s.connectedBadge}>
                <Text style={s.connectedText}>● DYNAMODB ACTIVO</Text>
              </View>
            ) : (
              <Pressable onPress={() => loadEvents()} style={s.disconnectedBadge}>
                <Text style={s.disconnectedText}>● CONECTANDO BACKEND (REINTENTAR)</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Barra de Navegación */}
        <View style={s.nav}>
          {([['dashboard', 'DASHBOARD'], ['events', 'EVENTOS'], ['form', '+ NUEVO EVENTO']] as const).map(([key, label]) => (
            <Pressable 
              key={key} 
              accessibilityRole="button" 
              onPress={() => key === 'form' ? openNew() : setPage(key)} 
              style={[s.navItem, page === key && s.navActive]}
            >
              <Text style={[s.navText, page === key && {color: c.white}]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Hero Banner */}
        <View style={s.hero}>
          <Text style={s.heroTag}>ZARAGOZA · FESTIVAL OPERATIONS</Text>
          <Text style={[s.heroTitle, wide && {fontSize: 62}]}>THE NIGHT{'\n'}IS YOUNG.</Text>
          <Text style={s.heroSub}>
            Gestión de programación en tiempo real con persistencia en Amazon DynamoDB (Pilar Serverless).
          </Text>
          {backendStatus && (
            <View style={s.dbInfoBox}>
              <Text style={s.dbInfoText}>
                🗄️ BBDD: <Text style={{color: c.pink, fontWeight: '800'}}>{backendStatus.database}</Text>
                {backendStatus.tableName ? ` · Tabla: ${backendStatus.tableName}` : ''}
                {backendStatus.region ? ` (${backendStatus.region})` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Indicador de Carga */}
        {loading && (
          <View style={s.loadingBox}>
            <ActivityIndicator size="small" color={c.pink} />
            <Text style={s.loadingText}>Sincronizando con DynamoDB...</Text>
          </View>
        )}

        {/* Dashboard */}
        {page === 'dashboard' && (
          <>
            <Text style={s.section}>PANEL DE CONTROL</Text>
            <View style={[s.stats, wide && {flexDirection: 'row'}]}>
              {([
                [String(events.length).padStart(2, '0'), 'EVENTOS', c.white],
                [String(confirmed).padStart(2, '0'), 'CONFIRMADOS', c.green],
                [String(delayed).padStart(2, '0'), 'RETRASADOS', c.amber],
                ['04', 'ESCENARIOS', c.pink]
              ] as const).map(([num, label, color]) => (
                <View key={label} style={[s.stat, wide && {flex: 1}]}>
                  <Text style={[s.statNumber, {color}]}>{num}</Text>
                  <Text style={s.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <View style={s.sectionRow}>
              <Text style={s.section}>PRÓXIMOS EVENTOS</Text>
              <Pressable onPress={() => setPage('events')}>
                <Text style={s.link}>VER TODOS →</Text>
              </Pressable>
            </View>

            {events.slice(0, 3).map(e => (
              <EventCard 
                key={e.id} 
                event={e} 
                onEdit={() => openEdit(e)} 
                onStatus={() => changeStatus(e.id)} 
                onDelete={() => remove(e.id)}
              />
            ))}
            <Action label="＋ CREAR NUEVO EVENTO" onPress={openNew} />
          </>
        )}

        {/* Programación Completa */}
        {page === 'events' && (
          <>
            <Text style={s.section}>PROGRAMACIÓN</Text>
            <Text style={s.subtitle}>{filtered.length} eventos · filtra y administra el festival con datos persistentes</Text>
            
            <TextInput 
              accessibilityLabel="Buscar artista o ID" 
              placeholder="Buscar artista o ID..." 
              placeholderTextColor="#777" 
              style={s.input} 
              value={search} 
              onChangeText={setSearch}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
              {['TODOS', ...stages].map(v => (
                <Pressable 
                  key={v} 
                  onPress={() => setFilter(v)} 
                  style={[s.filter, filter === v && s.filterActive]}
                >
                  <Text style={s.filterText}>{v}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {filtered.length === 0 && (
              <Text style={s.subtitle}>No hay eventos registrados con ese criterio.</Text>
            )}

            {filtered.map(e => (
              <EventCard 
                key={e.id} 
                event={e} 
                onEdit={() => openEdit(e)} 
                onStatus={() => changeStatus(e.id)} 
                onDelete={() => remove(e.id)}
              />
            ))}

            <Action label="＋ NUEVO EVENTO" onPress={openNew} />
          </>
        )}

        {/* Formulario Crear / Editar */}
        {page === 'form' && (
          <>
            <Text style={s.section}>{editing ? 'EDITAR EVENTO' : 'NUEVO EVENTO'}</Text>
            <Text style={s.subtitle}>
              Completa los datos del formulario. El registro persistirá en DynamoDB de forma indefinida.
            </Text>

            <View style={s.form}>
              <Text style={s.label}>ARTISTA *</Text>
              <TextInput 
                accessibilityLabel="Artista" 
                placeholder="Ej. TECHNO TITANS" 
                placeholderTextColor="#777" 
                style={s.input} 
                value={artist} 
                onChangeText={setArtist}
              />

              <Text style={s.label}>ESCENARIO</Text>
              <View style={s.choices}>
                {stages.map(v => (
                  <Pressable 
                    key={v} 
                    onPress={() => setSpace(v)} 
                    style={[s.choice, space === v && s.choiceActive]}
                  >
                    <Text style={s.choiceText}>{v}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.label}>HORA (HH:MM) *</Text>
              <TextInput 
                accessibilityLabel="Hora" 
                placeholder="21:45" 
                placeholderTextColor="#777" 
                style={s.input} 
                value={time} 
                onChangeText={setTime}
              />

              <Text style={s.label}>ESTADO</Text>
              <View style={s.choices}>
                {statuses.map(v => (
                  <Pressable 
                    key={v} 
                    onPress={() => setStatus(v)} 
                    style={[s.choice, status === v && s.choiceActive]}
                  >
                    <Text style={s.choiceText}>{v}</Text>
                  </Pressable>
                ))}
              </View>

              <Action 
                label={editing ? 'GUARDAR CAMBIOS EN DYNAMODB' : 'CREAR EVENTO EN DYNAMODB'} 
                onPress={save} 
                disabled={loading}
              />
              <Action label="CANCELAR" secondary onPress={() => setPage('events')} />
            </View>
          </>
        )}

        {/* Notificaciones del Sistema */}
        {!!notice && <Text accessibilityRole="alert" style={s.notice}>{notice}</Text>}

        {/* Pie de Página */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            FESTIVAL CONTROL · FULLSTACK SERVERLESS · REACT NATIVE + EXPRESS + AWS DYNAMODB
          </Text>
          <Text style={s.footerText}>
            PERSISTENCIA ACTIVA · REST API CRUD EN PUERTO 3001
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  container: { padding: 20, paddingBottom: 60 },
  header: { 
    paddingTop: 24, 
    paddingBottom: 22, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    flexWrap: 'wrap', 
    gap: 10 
  },
  brand: { fontSize: 20, fontWeight: '900', color: c.white, letterSpacing: 1 },
  kicker: { fontSize: 10, color: c.muted, letterSpacing: 2, marginTop: 5 },
  badgeContainer: { flexDirection: 'row', alignItems: 'center' },
  connectedBadge: { backgroundColor: '#0d2818', borderColor: c.green, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  connectedText: { color: c.green, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  disconnectedBadge: { backgroundColor: '#281a0d', borderColor: c.amber, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  disconnectedText: { color: c.amber, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  nav: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 18 },
  navItem: { backgroundColor: '#191919', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border },
  navActive: { backgroundColor: c.pink, borderColor: c.pink },
  navText: { fontSize: 11, fontWeight: '900', color: c.muted },
  hero: { backgroundColor: '#171018', borderColor: '#4C1934', borderWidth: 1, borderRadius: 22, padding: 28, marginBottom: 25 },
  heroTag: { fontSize: 11, color: c.pink, fontWeight: '900', letterSpacing: 2, marginBottom: 15 },
  heroTitle: { fontSize: 42, fontWeight: '900', color: c.white, lineHeight: 51, letterSpacing: -1 },
  heroSub: { color: '#B5B5B5', fontSize: 14, marginTop: 14, maxWidth: 550, lineHeight: 22 },
  dbInfoBox: { marginTop: 16, backgroundColor: '#21121c', padding: 10, borderRadius: 8, alignSelf: 'flex-start' },
  dbInfoText: { color: '#E0E0E0', fontSize: 11, fontWeight: '600' },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15, padding: 10, backgroundColor: '#1c1c1c', borderRadius: 8 },
  loadingText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  section: { fontSize: 22, color: c.white, fontWeight: '900', marginBottom: 15 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  link: { color: c.pink, fontSize: 11, fontWeight: '900' },
  subtitle: { color: c.muted, marginBottom: 18, lineHeight: 22 },
  stats: { gap: 12, marginBottom: 28 },
  stat: { backgroundColor: c.card, borderRadius: 16, borderColor: c.border, borderWidth: 1, padding: 22 },
  statNumber: { fontSize: 32, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '900', color: c.muted, marginTop: 7, letterSpacing: 1 },
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 18, padding: 20, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  time: { color: c.pink, fontSize: 16, fontWeight: '900' },
  status: { fontSize: 11, fontWeight: '900' },
  artist: { color: c.white, fontSize: 26, fontWeight: '900', marginTop: 12 },
  space: { color: c.muted, fontSize: 12, fontWeight: '700', marginTop: 6 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, borderTopWidth: 1, borderTopColor: c.border, marginTop: 19, paddingTop: 17 },
  actionText: { color: c.pink, fontSize: 11, fontWeight: '900' },
  button: { backgroundColor: c.pink, borderRadius: 12, padding: 17, alignItems: 'center', marginTop: 12 },
  buttonSecondary: { backgroundColor: '#292929' },
  buttonDanger: { backgroundColor: '#632233' },
  buttonText: { color: c.white, fontWeight: '900', fontSize: 12 },
  input: { backgroundColor: '#171717', color: c.white, borderRadius: 12, borderWidth: 1, borderColor: '#383838', padding: 16, marginBottom: 18, fontSize: 15 },
  filters: { gap: 8, paddingBottom: 16 },
  filter: { backgroundColor: '#242424', borderRadius: 9, padding: 11 },
  filterActive: { backgroundColor: c.pink },
  filterText: { color: c.white, fontSize: 10, fontWeight: '900' },
  form: { maxWidth: 650, width: '100%' },
  label: { color: c.muted, fontWeight: '900', fontSize: 11, letterSpacing: 1, marginBottom: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  choice: { padding: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, borderRadius: 9 },
  choiceActive: { backgroundColor: '#7B1947', borderColor: c.pink },
  choiceText: { color: c.white, fontSize: 11, fontWeight: '800' },
  notice: { marginTop: 22, color: c.green, fontWeight: '800' },
  footer: { borderTopWidth: 1, borderTopColor: c.border, marginTop: 38, paddingTop: 20, gap: 7 },
  footerText: { fontSize: 10, color: '#777', letterSpacing: 1 }
});
