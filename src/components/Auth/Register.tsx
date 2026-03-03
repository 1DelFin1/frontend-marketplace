import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { AccountType, SellerCreate, UserCreate } from '../../types/user';
import { toast } from 'react-toastify';

const Register: React.FC = () => {
  const [accountType, setAccountType] = useState<AccountType>('user');
  const [formData, setFormData] = useState<UserCreate>({
    email: '',
    name: '',
    password: '',
    birthday: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const roleLabel = useMemo(
    () => (accountType === 'seller' ? 'продавца' : 'покупателя'),
    [accountType],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password !== confirmPassword) {
      setError('Пароли не совпадают');
      setLoading(false);
      return;
    }

    try {
      if (accountType === 'seller') {
        const sellerPayload: SellerCreate = {
          email: formData.email,
          name: formData.name,
          password: formData.password,
          birthday: formData.birthday,
        };
        await apiService.createSeller(sellerPayload);
      } else {
        await apiService.createUser(formData);
      }

      toast.success(`Вы успешно зарегистрировали аккаунт ${roleLabel}!`);
      navigate('/login', {
        state: { message: `Регистрация ${roleLabel} успешна!` },
      });
    } catch (err: any) {
      setError(err.message || 'Ошибка при регистрации');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="auth-container">
      <div className="auth-card auth-card--register">
        <h2>Регистрация</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group role-selector-group">
            <span className="role-selector-label">Кого регистрируем?</span>
            <div className="role-selector-options">
              <label className={`role-option ${accountType === 'user' ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={accountType === 'user'}
                  onChange={() => setAccountType('user')}
                />
                <span>Покупатель</span>
              </label>

              <label className={`role-option ${accountType === 'seller' ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={accountType === 'seller'}
                  onChange={() => setAccountType('seller')}
                />
                <span>Продавец</span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Введите ваш email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="name">Имя</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder={accountType === 'seller' ? 'Название магазина или имя продавца' : 'Введите ваше имя'}
            />
          </div>

          <div className="form-group">
            <label htmlFor="birthday">Дата рождения</label>
            <input
              type="date"
              id="birthday"
              name="birthday"
              value={formData.birthday}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Придумайте пароль"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Подтвердите пароль</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Повторите пароль"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-button"
          >
            {loading ? 'Регистрация...' : `Зарегистрировать ${accountType === 'seller' ? 'продавца' : 'покупателя'}`}
          </button>
        </form>

        <div className="auth-switch">
          <span>Уже есть аккаунт? </span>
          <Link to="/login" className="auth-link">
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
