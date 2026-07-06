import CustomerLayout from './customer_layout';

function Profile() {
    const user = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@email.com',
        phone: '+63 912 345 6789',
        address: 'Dasmariñas, Cavite',
        memberSince: 'January 2026'
    };

    return (
        <CustomerLayout title="My Profile">
            <div className="profile-page">

                {/* Profile Header */}
                <div className="profile-card">
                    <div className="profile-header">
                        <div className="profile-avatar">
                            👤
                        </div>

                        <div className="profile-info">
                            <h2>
                                {user.firstName} {user.lastName}
                            </h2>
                            <p>{user.email}</p>
                            <span>
                                Member since {user.memberSince}
                            </span>
                        </div>

                        <button className="edit-profile-btn">
                            Edit Profile
                        </button>
                    </div>
                </div>

                {/* Personal Information */}
                <div className="profile-card">
                    <h3 className="section-title">
                        Personal Information
                    </h3>

                    <div className="profile-grid">
                        <div className="profile-field">
                            <label>First Name</label>
                            <div>{user.firstName}</div>
                        </div>

                        <div className="profile-field">
                            <label>Last Name</label>
                            <div>{user.lastName}</div>
                        </div>

                        <div className="profile-field">
                            <label>Email Address</label>
                            <div>{user.email}</div>
                        </div>

                        <div className="profile-field">
                            <label>Phone Number</label>
                            <div>{user.phone}</div>
                        </div>

                        <div className="profile-field full-width">
                            <label>Address</label>
                            <div>{user.address}</div>
                        </div>
                    </div>
                </div>

                {/* Account Settings */}
                <div className="profile-card">
                    <h3 className="section-title">
                        Account Settings
                    </h3>

                    <div className="account-actions">
                        <button className="change-password-btn">
                            Change Password
                        </button>

                        <button className="delete-account-btn">
                            Delete Account
                        </button>
                    </div>
                </div>

            </div>
        </CustomerLayout>
    );
}

export default Profile;