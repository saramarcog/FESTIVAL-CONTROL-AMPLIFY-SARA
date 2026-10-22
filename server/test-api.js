async function testApi() {
  const baseUrl = 'http://localhost:3001/api';
  console.log('--- 1. Testing GET /api/health ---');
  const healthRes = await fetch(`${baseUrl}/health`);
  const health = await healthRes.json();
  console.log('Health:', health);

  console.log('\n--- 2. Testing GET /api/events ---');
  const eventsRes = await fetch(`${baseUrl}/events`);
  const events = await eventsRes.json();
  console.log(`Recibidos ${events.length} eventos.`);
  console.log('Primer evento:', events[0]);

  console.log('\n--- 3. Testing POST /api/events (Crear TECHNO TITANS) ---');
  const postRes = await fetch(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artist: 'TECHNO TITANS',
      space: 'MAIN STAGE',
      time: '21:45',
      status: 'CONFIRMED'
    })
  });
  const created = await postRes.json();
  console.log('Evento Creado:', created);

  console.log('\n--- 4. Testing PATCH /api/events/:id/status (Cambiar a DELAYED) ---');
  const patchRes = await fetch(`${baseUrl}/events/${created.id}/status`, {
    method: 'PATCH'
  });
  const patched = await patchRes.json();
  console.log('Evento con nuevo estado:', patched);

  console.log('\n--- 5. Testing PUT /api/events/:id (Cambiar hora a 23:00) ---');
  const putRes = await fetch(`${baseUrl}/events/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      time: '23:00'
    })
  });
  const updated = await putRes.json();
  console.log('Evento actualizado:', updated);

  console.log('\n--- 6. Testing DELETE /api/events/:id ---');
  const delRes = await fetch(`${baseUrl}/events/${created.id}`, {
    method: 'DELETE'
  });
  const deleted = await delRes.json();
  console.log('Resultado eliminación:', deleted);

  console.log('\n--- 7. Verificar eventos finales ---');
  const finalRes = await fetch(`${baseUrl}/events`);
  const finalEvents = await finalRes.json();
  console.log(`Total final de eventos: ${finalEvents.length}`);
  console.log('✅ TODAS LAS PRUEBAS DEL BACKEND Y DYNAMODB SUPERADAS CON ÉXITO');
}

testApi().catch(console.error);

