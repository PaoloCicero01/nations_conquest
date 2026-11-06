import {
  useNavigate,
} from "react-router-dom";
import {
  useAuth,
} from "../../context/AuthContext";
import "./ProfileButton.css";

function ProfileButton() {
  const navigate = useNavigate();
  const {user,authLoading} = useAuth();
  function getLabel() {
    if (authLoading) {
      return "Caricamento...";
    }
    if(!user){
      return "Profilo";
    }
    if(user.isAnonymous){
      return "Guest";
    }
    return (user.displayName || user.email || "Profilo");
  }
  return (
    <button type="button" className="profile-button" onClick={() => navigate("/profile")}>
      <span className="profile-button-icon" aria-hidden="true">
        👤
      </span>
      <span>
        {getLabel()}
      </span>
    </button>
  );
}

export default ProfileButton;