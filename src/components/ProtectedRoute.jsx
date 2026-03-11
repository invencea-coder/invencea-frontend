import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // adjust path as needed

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth(); // your auth context should provide user and loading

  if (loading) {
    // Optional: show a loading spinner while checking auth status
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!user) {
    // Not logged in → redirect to login selection page
    return <Navigate to="/login" replace />;
  }

  // Authenticated → render the requested page
  return children;
};

export default ProtectedRoute;