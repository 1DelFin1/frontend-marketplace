import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { User, UserUpdate } from '../../types/user';
import { apiService } from '../../services/api';
import { getUserFromToken } from '../../utils/auth';

const Profile: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<UserUpdate>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const tokenUser = getUserFromToken();
      if (!tokenUser?.id) {
        toast.error('Ошибка авторизации');
        return;
      }

      const userData = await apiService.getUserById(tokenUser.id);
      setUser(userData);
      setFormData({
        name: userData.name,
        email: userData.email,
        birthday: userData.birthday,
      });
    } catch (error) {
      toast.error('Ошибка загрузки данных пользователя');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (user) {
        const updatedUser = await apiService.updateUser(user.id, formData);
        setUser(updatedUser);
        setEditMode(false);
        toast.success('Данные успешно обновлены');
      }
    } catch (error) {
      toast.error('Ошибка обновления данных');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  if (!user) {
    return <div>Загрузка...</div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-card">
        <h2>Личный кабинет</h2>

        {editMode ? (
          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <label htmlFor="name">Имя</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email || ''}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="birthday">Дата рождения</label>
              <input
                type="date"
                id="birthday"
                name="birthday"
                value={formData.birthday || ''}
                onChange={handleChange}
              />
            </div>

            <div className="profile-actions">
              <button
                type="submit"
                disabled={loading}
                className="save-btn"
              >
                {loading ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="cancel-btn"
              >
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <div className="profile-info">
            <div className="info-item">
              <label>Имя:</label>
              <span>{user.name}</span>
            </div>
            <div className="info-item">
              <label>Email:</label>
              <span>{user.email}</span>
            </div>
            {user.birthday && (
              <div className="info-item">
                <label>Дата рождения:</label>
                <span>{new Date(user.birthday).toLocaleDateString()}</span>
              </div>
            )}

            <button
              onClick={() => setEditMode(true)}
              className="edit-btn"
            >
              Редактировать профиль
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
