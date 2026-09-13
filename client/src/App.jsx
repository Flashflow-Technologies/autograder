import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { Loading } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';
import LicensePage from './pages/admin/LicensePage.jsx';
import UsersDashboard from './pages/admin/UsersDashboard.jsx';
import UserImport from './pages/admin/UserImport.jsx';
import Departments from './pages/admin/Departments.jsx';
import Courses from './pages/admin/Courses.jsx';
import InstituteSettings from './pages/admin/InstituteSettings.jsx';
import DepartmentSettings from './pages/admin/DepartmentSettings.jsx';
import LogsDashboard from './pages/admin/LogsDashboard.jsx';
import AccountabilityDashboard from './pages/admin/AccountabilityDashboard.jsx';
import FacultyHome from './pages/faculty/FacultyHome.jsx';
import ExamBuilder from './pages/faculty/ExamBuilder.jsx';
import ReviewQueue from './pages/faculty/ReviewQueue.jsx';
import StudentHome from './pages/student/StudentHome.jsx';
import TakeExam from './pages/student/TakeExam.jsx';
import Result from './pages/student/Result.jsx';

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  // Force a password change before anything else is accessible.
  if (user.mustChangePassword && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/${user.role}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />
          <Route path="/" element={<HomeRedirect />} />

          <Route path="/admin" element={<Protected roles={['admin']}><AdminHome /></Protected>} />
          <Route path="/admin/license" element={<Protected roles={['admin']}><LicensePage /></Protected>} />
          <Route path="/admin/users" element={<Protected roles={['admin']}><UsersDashboard /></Protected>} />
          <Route path="/admin/users/add" element={<Protected roles={['admin']}><UserImport /></Protected>} />
          <Route path="/admin/departments" element={<Protected roles={['admin']}><Departments /></Protected>} />
          <Route path="/admin/courses" element={<Protected roles={['admin']}><Courses /></Protected>} />
          <Route path="/admin/department/:id/settings" element={<Protected roles={['admin']}><DepartmentSettings /></Protected>} />
          <Route path="/admin/institute" element={<Protected roles={['admin']}><InstituteSettings /></Protected>} />
          <Route path="/admin/audit" element={<Protected roles={['admin']}><LogsDashboard /></Protected>} />
          <Route path="/admin/accountability" element={<Protected roles={['admin']}><AccountabilityDashboard /></Protected>} />

          <Route path="/faculty" element={<Protected roles={['faculty', 'admin']}><FacultyHome /></Protected>} />
          <Route path="/faculty/exam/:examId" element={<Protected roles={['faculty', 'admin']}><ExamBuilder /></Protected>} />
          <Route path="/faculty/exam/:examId/review" element={<Protected roles={['faculty', 'admin']}><ReviewQueue /></Protected>} />

          <Route path="/student" element={<Protected roles={['student']}><StudentHome /></Protected>} />
          <Route path="/student/exam/:examId" element={<Protected roles={['student']}><TakeExam /></Protected>} />
          <Route path="/student/result/:examId" element={<Protected roles={['student']}><Result /></Protected>} />


          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
