import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const DEVICE_ID_KEY = 'seialz_device_id';
const SESSION_CHECK_INTERVAL = 30000; // 30 segundos

export function useSingleSession() {
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const getOrCreateDeviceId = (): string => {
      let deviceId = localStorage.getItem(DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
      }
      return deviceId;
    };

    const registerSession = async (userId: string) => {
      const deviceId = getOrCreateDeviceId();
      const userAgent = navigator.userAgent;

      try {
        // Registrar ou atualizar sessão do device atual
        await supabase
          .from('user_sessions')
          .upsert(
            {
              user_id: userId,
              device_id: deviceId,
              last_seen_at: new Date().toISOString(),
              user_agent: userAgent,
            },
            {
              onConflict: 'user_id,device_id',
            }
          );

        // Deletar sessões antigas de outros devices (mais de 30 dias)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        await supabase
          .from('user_sessions')
          .delete()
          .eq('user_id', userId)
          .lt('last_seen_at', thirtyDaysAgo.toISOString());
      } catch (error) {
        console.error('Error registering session:', error);
      }
    };

    const checkSessionValidity = async (userId: string) => {
      const deviceId = getOrCreateDeviceId();

      try {
        // Buscar a sessão mais recente do usuário
        const { data: sessions, error } = await supabase
          .from('user_sessions')
          .select('device_id, last_seen_at')
          .eq('user_id', userId)
          .order('last_seen_at', { ascending: false })
          .limit(5);

        if (error) throw error;

        // Se há sessões mais recentes de outros devices, fazer logout
        if (sessions && sessions.length > 0) {
          const currentSession = sessions.find(s => s.device_id === deviceId);
          const newerSessions = sessions.filter(
            s => s.device_id !== deviceId && 
            new Date(s.last_seen_at) > new Date(currentSession?.last_seen_at || 0)
          );

          if (newerSessions.length > 0) {
            // Há sessão mais nova em outro device, fazer logout
            await supabase.auth.signOut();
            localStorage.removeItem(DEVICE_ID_KEY);
            window.location.href = '/auth/signin';
          }
        }
      } catch (error) {
        console.error('Error checking session validity:', error);
      }
    };

    const setupSessionMonitoring = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Buscar user_id da tabela users
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (userData) {
          await registerSession(userData.id);
          
          // Verificar periodicamente se sessão ainda é válida
          intervalId = setInterval(() => {
            checkSessionValidity(userData.id);
            registerSession(userData.id); // Atualizar last_seen_at
          }, SESSION_CHECK_INTERVAL);
        }
      }
    };

    // Configurar monitoramento ao montar
    setupSessionMonitoring();

    // Limpar intervalo ao desmontar
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);
}
