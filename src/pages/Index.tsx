import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Icon from '@/components/ui/icon';
import { useToast } from '@/hooks/use-toast';

const AUTH_URL = 'https://functions.poehali.dev/efff3ea6-7b0a-4ae3-8173-eaa9ffeaed72';
const CHAT_URL = 'https://functions.poehali.dev/9e5c941b-b7d3-411e-a9db-f21100057d41';

interface Message {
  id: number;
  username: string;
  message: string;
  timestamp: string;
  messageType?: string;
  mediaUrl?: string;
  userId?: number;
}

interface User {
  userId: number;
  username: string;
  notificationsEnabled?: boolean;
}

export default function Index() {
  const [isAuth, setIsAuth] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const { toast } = useToast();
  const lastMessageCountRef = useRef(0);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData);
      setIsAuth(true);
      setNotificationsEnabled(userData.notificationsEnabled ?? true);
    }
  }, []);

  useEffect(() => {
    if (isAuth) {
      fetchMessages();
      fetchOnlineCount();
      const interval = setInterval(() => {
        fetchMessages();
        fetchOnlineCount();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isAuth]);

  useEffect(() => {
    scrollToBottom();
    
    if (messages.length > lastMessageCountRef.current && lastMessageCountRef.current > 0) {
      const newMsg = messages[messages.length - 1];
      if (newMsg.username !== user?.username && notificationsEnabled) {
        playNotificationSound();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`${newMsg.username}: ${newMsg.message.substring(0, 50)}`);
        }
      }
    }
    lastMessageCountRef.current = messages.length;
  }, [messages, user, notificationsEnabled]);

  const playNotificationSound = () => {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiDcJGGi57OWeTRALUKbk77RgGwU7k9br1IQ0CxVqtvPtnl8dC0S06Oy2ZCIEMpDR7N2UQA0TXsH28KhJD');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const response = await fetch(CHAT_URL);
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchOnlineCount = async () => {
    try {
      const response = await fetch(`${CHAT_URL}?action=online`);
      const data = await response.json();
      setOnlineCount(data.online || 0);
    } catch (error) {
      console.error('Error fetching online count:', error);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password) {
      toast({
        title: 'Ошибка',
        description: 'Заполните все поля',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isLogin ? 'login' : 'register',
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: 'Ошибка',
          description: data.error || 'Что-то пошло не так',
          variant: 'destructive',
        });
        return;
      }

      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
      setIsAuth(true);
      setNotificationsEnabled(data.notificationsEnabled ?? true);
      
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      
      toast({
        title: 'Успешно!',
        description: isLogin ? 'Вы вошли в систему' : 'Регистрация прошла успешно',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось подключиться к серверу',
        variant: 'destructive',
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'audio/mpeg', 'audio/mp3'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: 'Ошибка',
          description: 'Поддерживаются только PNG, JPG и MP3',
          variant: 'destructive',
        });
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'Ошибка',
          description: 'Файл не должен превышать 10 МБ',
          variant: 'destructive',
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice.webm', { type: 'audio/webm' });
        setSelectedFile(file);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось получить доступ к микрофону',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData,
    });
    
    const data = await response.json();
    return data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() && !selectedFile) return;

    try {
      let mediaUrl = null;
      let messageType = 'text';

      if (selectedFile) {
        mediaUrl = await uploadFile(selectedFile);
        if (selectedFile.type.startsWith('image/')) {
          messageType = 'image';
        } else if (selectedFile.type.startsWith('audio/')) {
          messageType = 'audio';
        }
      }

      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.userId,
          username: user?.username,
          message: newMessage,
          messageType,
          mediaUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: 'Ошибка',
          description: data.error || 'Не удалось отправить сообщение',
          variant: 'destructive',
        });
        return;
      }

      setNewMessage('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchMessages();
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось отправить сообщение',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveMessage = async (messageId: number) => {
    try {
      await fetch(CHAT_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          userId: user?.userId,
        }),
      });
      fetchMessages();
      toast({
        title: 'Сообщение удалено',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось удалить сообщение',
        variant: 'destructive',
      });
    }
  };

  const handleReportMessage = async (messageId: number) => {
    try {
      await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report',
          messageId,
          userId: user?.userId,
          reason: 'Inappropriate content',
        }),
      });
      toast({
        title: 'Жалоба отправлена',
        description: 'Спасибо за помощь в модерации',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось отправить жалобу',
        variant: 'destructive',
      });
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    try {
      await fetch(AUTH_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.userId,
          notificationsEnabled: enabled,
        }),
      });
      
      setNotificationsEnabled(enabled);
      const updatedUser = { ...user!, notificationsEnabled: enabled };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      if (enabled && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      
      toast({
        title: enabled ? 'Уведомления включены' : 'Уведомления отключены',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось обновить настройки',
        variant: 'destructive',
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setIsAuth(false);
    setMessages([]);
  };

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 space-y-6 animate-fade-in">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">Рулетка Чат</h1>
            <p className="text-muted-foreground">
              {isLogin ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Имя пользователя"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12"
              />
            </div>

            <div className="space-y-2 relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
              >
                <Icon name={showPassword ? 'EyeOff' : 'Eye'} size={20} />
              </button>
            </div>

            <Button type="submit" className="w-full h-12 text-base font-semibold">
              {isLogin ? 'Войти' : 'Зарегистрироваться'}
            </Button>
          </form>

          <div className="text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-muted-foreground hover:text-primary transition"
            >
              {isLogin ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите'}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card p-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Рулетка Чат</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>{onlineCount} онлайн</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">@{user?.username}</span>
            
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Icon name="Settings" size={16} className="mr-2" />
                  Настройки
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Настройки</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notifications">Уведомления о новых сообщениях</Label>
                    <Switch
                      id="notifications"
                      checked={notificationsEnabled}
                      onCheckedChange={toggleNotifications}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <Icon name="LogOut" size={16} className="mr-2" />
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-4">
        <div className="flex-1 bg-card rounded-lg border border-border overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Общий чат</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                <Icon name="MessageCircle" size={48} className="mx-auto mb-3 opacity-50" />
                <p>Пока нет сообщений</p>
                <p className="text-sm mt-1">Будьте первым!</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 animate-fade-in ${
                    msg.username === user?.username ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Icon name="User" size={20} />
                  </div>
                  <div
                    className={`flex-1 ${
                      msg.username === user?.username ? 'text-right' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{msg.username}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {msg.username === user?.username && (
                        <button
                          onClick={() => handleRemoveMessage(msg.id)}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          <Icon name="Trash2" size={14} />
                        </button>
                      )}
                      {msg.username !== user?.username && (
                        <button
                          onClick={() => handleReportMessage(msg.id)}
                          className="text-xs text-muted-foreground hover:text-destructive"
                        >
                          <Icon name="Flag" size={14} />
                        </button>
                      )}
                    </div>
                    <div
                      className={`inline-block px-4 py-2 rounded-lg ${
                        msg.username === user?.username
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary'
                      }`}
                    >
                      {msg.messageType === 'image' && msg.mediaUrl && (
                        <img 
                          src={msg.mediaUrl} 
                          alt="Изображение" 
                          className="max-w-xs rounded mb-2"
                        />
                      )}
                      {msg.messageType === 'audio' && msg.mediaUrl && (
                        <audio controls className="mb-2">
                          <source src={msg.mediaUrl} />
                        </audio>
                      )}
                      {msg.message && <div>{msg.message}</div>}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 border-t border-border">
            {selectedFile && (
              <div className="mb-2 p-2 bg-secondary rounded flex items-center justify-between">
                <span className="text-sm truncate">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="ml-2"
                >
                  <Icon name="X" size={16} />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,audio/mpeg,audio/mp3"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="Paperclip" size={20} />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={isRecording ? stopRecording : startRecording}
                className={isRecording ? 'bg-destructive text-destructive-foreground' : ''}
              >
                <Icon name={isRecording ? 'Square' : 'Mic'} size={20} />
              </Button>
              <Input
                type="text"
                placeholder="Напишите сообщение..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" size="icon" className="flex-shrink-0">
                <Icon name="Send" size={20} />
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
