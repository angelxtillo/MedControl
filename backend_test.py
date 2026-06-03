#!/usr/bin/env python3
"""
Comprehensive Backend Testing for MedControl Application
Tests all API endpoints with realistic data scenarios
"""

import requests
import json
import sys
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from environment
BACKEND_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://medialert-10.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

print(f"Testing backend at: {API_BASE}")

class MedControlTester:
    def __init__(self):
        self.token = None
        self.user_id = None
        self.patient_id = None
        self.medication_id = None
        self.log_id = None
        self.test_results = {
            'passed': 0,
            'failed': 0,
            'errors': []
        }

    def log_result(self, test_name, success, message=""):
        if success:
            self.test_results['passed'] += 1
            print(f"✅ {test_name}: PASSED")
        else:
            self.test_results['failed'] += 1
            self.test_results['errors'].append(f"{test_name}: {message}")
            print(f"❌ {test_name}: FAILED - {message}")

    def make_request(self, method, endpoint, data=None, headers=None):
        """Make HTTP request with error handling"""
        url = f"{API_BASE}{endpoint}"
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request error for {method} {url}: {str(e)}")
            return None

    def get_auth_headers(self):
        """Get authorization headers"""
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    def test_auth_register(self):
        """Test user registration"""
        print("\n=== Testing Authentication - Register ===")
        
        # Test data with realistic Spanish names
        test_user = {
            "name": "María González",
            "email": "maria.gonzalez@medcontrol.com",
            "password": "MedControl2024!"
        }
        
        response = self.make_request('POST', '/auth/register', test_user)
        
        if response is None:
            self.log_result("Auth Register", False, "Request failed")
            return False
            
        if response.status_code == 201 or response.status_code == 200:
            try:
                data = response.json()
                if 'token' in data and 'user' in data:
                    self.token = data['token']
                    self.user_id = data['user']['id']
                    self.log_result("Auth Register", True)
                    print(f"   User ID: {self.user_id}")
                    return True
                else:
                    self.log_result("Auth Register", False, "Missing token or user in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Auth Register", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Auth Register", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_auth_login(self):
        """Test user login"""
        print("\n=== Testing Authentication - Login ===")
        
        login_data = {
            "email": "maria.gonzalez@medcontrol.com",
            "password": "MedControl2024!"
        }
        
        response = self.make_request('POST', '/auth/login', login_data)
        
        if response is None:
            self.log_result("Auth Login", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                if 'token' in data and 'user' in data:
                    # Update token in case it's different
                    self.token = data['token']
                    self.log_result("Auth Login", True)
                    return True
                else:
                    self.log_result("Auth Login", False, "Missing token or user in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Auth Login", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Auth Login", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_patients_create(self):
        """Test patient creation"""
        print("\n=== Testing Patients - Create ===")
        
        # Test with realistic Spanish patient data
        patient_data = {
            "name": "Carlos Rodríguez",
            "age": 68,
            "notes": "Paciente con diabetes tipo 2 e hipertensión. Requiere monitoreo constante de medicamentos."
        }
        
        response = self.make_request('POST', '/patients', patient_data, self.get_auth_headers())
        
        if response is None:
            self.log_result("Patient Create", False, "Request failed")
            return False
            
        if response.status_code == 200 or response.status_code == 201:
            try:
                data = response.json()
                if 'id' in data:
                    self.patient_id = data['id']
                    self.log_result("Patient Create", True)
                    print(f"   Patient ID: {self.patient_id}")
                    return True
                else:
                    self.log_result("Patient Create", False, "Missing patient ID in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Patient Create", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Patient Create", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_patients_create_with_photo(self):
        """Test patient creation with photo"""
        print("\n=== Testing Patients - Create with Photo ===")
        
        # Simulate base64 photo data
        fake_photo_base64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
        
        patient_data = {
            "name": "Ana Martínez",
            "age": 45,
            "photo": fake_photo_base64,
            "notes": "Paciente con artritis reumatoide. Medicación antiinflamatoria regular."
        }
        
        response = self.make_request('POST', '/patients', patient_data, self.get_auth_headers())
        
        if response is None:
            self.log_result("Patient Create with Photo", False, "Request failed")
            return False
            
        if response.status_code == 200 or response.status_code == 201:
            try:
                data = response.json()
                if 'id' in data and data.get('photo') == fake_photo_base64:
                    self.log_result("Patient Create with Photo", True)
                    return True
                else:
                    self.log_result("Patient Create with Photo", False, "Photo not saved correctly")
                    return False
            except json.JSONDecodeError:
                self.log_result("Patient Create with Photo", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Patient Create with Photo", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_patients_list(self):
        """Test listing patients"""
        print("\n=== Testing Patients - List ===")
        
        response = self.make_request('GET', '/patients', headers=self.get_auth_headers())
        
        if response is None:
            self.log_result("Patient List", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                if isinstance(data, list) and len(data) >= 1:
                    self.log_result("Patient List", True)
                    print(f"   Found {len(data)} patients")
                    return True
                else:
                    self.log_result("Patient List", False, "No patients found or invalid format")
                    return False
            except json.JSONDecodeError:
                self.log_result("Patient List", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Patient List", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_patients_update(self):
        """Test updating patient"""
        print("\n=== Testing Patients - Update ===")
        
        if not self.patient_id:
            self.log_result("Patient Update", False, "No patient ID available")
            return False
        
        update_data = {
            "age": 69,
            "notes": "Paciente con diabetes tipo 2 e hipertensión. Actualizado: Añadido control de colesterol."
        }
        
        response = self.make_request('PUT', f'/patients/{self.patient_id}', update_data, self.get_auth_headers())
        
        if response is None:
            self.log_result("Patient Update", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                if data.get('age') == 69:
                    self.log_result("Patient Update", True)
                    return True
                else:
                    self.log_result("Patient Update", False, "Update not reflected in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Patient Update", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Patient Update", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_medications_create(self):
        """Test medication creation with multiple schedules"""
        print("\n=== Testing Medications - Create ===")
        
        if not self.patient_id:
            self.log_result("Medication Create", False, "No patient ID available")
            return False
        
        # Realistic medication data
        medication_data = {
            "patient_id": self.patient_id,
            "name": "Metformina",
            "dosage": "850mg",
            "frequency": "twice_daily",
            "schedule_times": ["08:00", "20:00"],
            "start_date": datetime.now().strftime("%Y-%m-%d"),
            "end_date": (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d"),
            "instructions": "Tomar con las comidas para reducir efectos gastrointestinales",
            "refill_alert_days": 7,
            "active": True
        }
        
        response = self.make_request('POST', '/medications', medication_data, self.get_auth_headers())
        
        if response is None:
            self.log_result("Medication Create", False, "Request failed")
            return False
            
        if response.status_code == 200 or response.status_code == 201:
            try:
                data = response.json()
                if 'id' in data and data.get('name') == 'Metformina':
                    self.medication_id = data['id']
                    self.log_result("Medication Create", True)
                    print(f"   Medication ID: {self.medication_id}")
                    return True
                else:
                    self.log_result("Medication Create", False, "Invalid medication data in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Medication Create", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Medication Create", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_medications_list(self):
        """Test listing medications for patient"""
        print("\n=== Testing Medications - List ===")
        
        if not self.patient_id:
            self.log_result("Medication List", False, "No patient ID available")
            return False
        
        response = self.make_request('GET', f'/medications/patient/{self.patient_id}', headers=self.get_auth_headers())
        
        if response is None:
            self.log_result("Medication List", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                if isinstance(data, list) and len(data) >= 1:
                    self.log_result("Medication List", True)
                    print(f"   Found {len(data)} medications")
                    return True
                else:
                    self.log_result("Medication List", False, "No medications found or invalid format")
                    return False
            except json.JSONDecodeError:
                self.log_result("Medication List", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Medication List", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_medications_update(self):
        """Test updating medication"""
        print("\n=== Testing Medications - Update ===")
        
        if not self.medication_id:
            self.log_result("Medication Update", False, "No medication ID available")
            return False
        
        update_data = {
            "dosage": "1000mg",
            "instructions": "Tomar con las comidas principales. Aumentada dosis según indicación médica."
        }
        
        response = self.make_request('PUT', f'/medications/{self.medication_id}', update_data, self.get_auth_headers())
        
        if response is None:
            self.log_result("Medication Update", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                if data.get('dosage') == '1000mg':
                    self.log_result("Medication Update", True)
                    return True
                else:
                    self.log_result("Medication Update", False, "Update not reflected in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Medication Update", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Medication Update", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_logs_create(self):
        """Test creating medication log"""
        print("\n=== Testing Logs - Create ===")
        
        if not self.medication_id or not self.patient_id:
            self.log_result("Log Create", False, "Missing medication or patient ID")
            return False
        
        log_data = {
            "medication_id": self.medication_id,
            "patient_id": self.patient_id,
            "scheduled_datetime": datetime.now().strftime("%Y-%m-%dT08:00:00"),
            "status": "taken",
            "notes": "Medicamento tomado correctamente con el desayuno"
        }
        
        response = self.make_request('POST', '/logs', log_data, self.get_auth_headers())
        
        if response is None:
            self.log_result("Log Create", False, "Request failed")
            return False
            
        if response.status_code == 200 or response.status_code == 201:
            try:
                data = response.json()
                if 'id' in data and data.get('status') == 'taken':
                    self.log_id = data['id']
                    self.log_result("Log Create", True)
                    print(f"   Log ID: {self.log_id}")
                    return True
                else:
                    self.log_result("Log Create", False, "Invalid log data in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Log Create", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Log Create", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_logs_list(self):
        """Test listing logs for patient"""
        print("\n=== Testing Logs - List ===")
        
        if not self.patient_id:
            self.log_result("Log List", False, "No patient ID available")
            return False
        
        response = self.make_request('GET', f'/logs/patient/{self.patient_id}', headers=self.get_auth_headers())
        
        if response is None:
            self.log_result("Log List", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Log List", True)
                    print(f"   Found {len(data)} logs")
                    return True
                else:
                    self.log_result("Log List", False, "Invalid format")
                    return False
            except json.JSONDecodeError:
                self.log_result("Log List", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Log List", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_logs_update(self):
        """Test updating log"""
        print("\n=== Testing Logs - Update ===")
        
        if not self.log_id:
            self.log_result("Log Update", False, "No log ID available")
            return False
        
        update_data = {
            "status": "taken",
            "notes": "Medicamento tomado correctamente. Sin efectos secundarios observados."
        }
        
        response = self.make_request('PUT', f'/logs/{self.log_id}', update_data, self.get_auth_headers())
        
        if response is None:
            self.log_result("Log Update", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                if "Sin efectos secundarios" in data.get('notes', ''):
                    self.log_result("Log Update", True)
                    return True
                else:
                    self.log_result("Log Update", False, "Update not reflected in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Log Update", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Log Update", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_dashboard_today(self):
        """Test dashboard endpoint"""
        print("\n=== Testing Dashboard - Today ===")
        
        response = self.make_request('GET', '/dashboard/today', headers=self.get_auth_headers())
        
        if response is None:
            self.log_result("Dashboard Today", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                required_fields = ['medications_today', 'completed', 'pending', 'missed']
                if all(field in data for field in required_fields):
                    self.log_result("Dashboard Today", True)
                    print(f"   Medications today: {len(data['medications_today'])}")
                    print(f"   Completed: {data['completed']}, Pending: {data['pending']}, Missed: {data['missed']}")
                    return True
                else:
                    self.log_result("Dashboard Today", False, "Missing required fields in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("Dashboard Today", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Dashboard Today", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_ai_assistant(self):
        """Test AI assistant endpoint"""
        print("\n=== Testing AI Assistant ===")
        
        query_data = {
            "question": "¿Cuáles son los efectos secundarios más comunes de la Metformina?"
        }
        
        response = self.make_request('POST', '/ai/ask', query_data, self.get_auth_headers())
        
        if response is None:
            self.log_result("AI Assistant", False, "Request failed")
            return False
            
        if response.status_code == 200:
            try:
                data = response.json()
                if 'answer' in data and 'question' in data:
                    answer = data['answer'].lower()
                    # Check if response is in Spanish and mentions common side effects
                    if any(word in answer for word in ['metformina', 'efectos', 'gastrointestinal', 'náuseas']):
                        self.log_result("AI Assistant", True)
                        print(f"   Question: {data['question']}")
                        print(f"   Answer preview: {data['answer'][:100]}...")
                        return True
                    else:
                        self.log_result("AI Assistant", False, "Response doesn't seem relevant or in Spanish")
                        return False
                else:
                    self.log_result("AI Assistant", False, "Missing answer or question in response")
                    return False
            except json.JSONDecodeError:
                self.log_result("AI Assistant", False, "Invalid JSON response")
                return False
        else:
            self.log_result("AI Assistant", False, f"Status {response.status_code}: {response.text}")
            return False

    def test_error_handling(self):
        """Test error handling scenarios"""
        print("\n=== Testing Error Handling ===")
        
        # Test 401 - Invalid token
        invalid_headers = {"Authorization": "Bearer invalid_token"}
        response = self.make_request('GET', '/patients', headers=invalid_headers)
        
        if response and response.status_code == 401:
            self.log_result("Error Handling - 401", True)
        else:
            self.log_result("Error Handling - 401", False, f"Expected 401, got {response.status_code if response else 'None'}")
        
        # Test 404 - Non-existent patient
        response = self.make_request('GET', '/patients/nonexistent_id', headers=self.get_auth_headers())
        
        if response and response.status_code == 404:
            self.log_result("Error Handling - 404", True)
        else:
            self.log_result("Error Handling - 404", False, f"Expected 404, got {response.status_code if response else 'None'}")

    def test_access_control(self):
        """Test that caregivers can only access their own data"""
        print("\n=== Testing Access Control ===")
        
        # Create another user
        test_user2 = {
            "name": "Pedro Sánchez",
            "email": "pedro.sanchez@medcontrol.com",
            "password": "MedControl2024!"
        }
        
        response = self.make_request('POST', '/auth/register', test_user2)
        
        if response and response.status_code in [200, 201]:
            try:
                data = response.json()
                other_token = data['token']
                other_headers = {"Authorization": f"Bearer {other_token}"}
                
                # Try to access first user's patients with second user's token
                response = self.make_request('GET', '/patients', headers=other_headers)
                
                if response and response.status_code == 200:
                    data = response.json()
                    if len(data) == 0:  # Should not see other user's patients
                        self.log_result("Access Control", True)
                        return True
                    else:
                        self.log_result("Access Control", False, "Can see other user's patients")
                        return False
                else:
                    self.log_result("Access Control", False, "Failed to test access control")
                    return False
            except json.JSONDecodeError:
                self.log_result("Access Control", False, "Invalid JSON response")
                return False
        else:
            self.log_result("Access Control", False, "Failed to create second user")
            return False

    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n=== Cleaning up test data ===")
        
        # Delete medication
        if self.medication_id:
            response = self.make_request('DELETE', f'/medications/{self.medication_id}', headers=self.get_auth_headers())
            if response and response.status_code == 200:
                print("✅ Medication deleted")
            else:
                print("❌ Failed to delete medication")
        
        # Delete patient
        if self.patient_id:
            response = self.make_request('DELETE', f'/patients/{self.patient_id}', headers=self.get_auth_headers())
            if response and response.status_code == 200:
                print("✅ Patient deleted")
            else:
                print("❌ Failed to delete patient")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting MedControl Backend API Tests")
        print("=" * 50)
        
        # Authentication tests
        if not self.test_auth_register():
            print("❌ Cannot continue without authentication")
            return
        
        self.test_auth_login()
        
        # Patient tests
        self.test_patients_create()
        self.test_patients_create_with_photo()
        self.test_patients_list()
        self.test_patients_update()
        
        # Medication tests
        self.test_medications_create()
        self.test_medications_list()
        self.test_medications_update()
        
        # Log tests
        self.test_logs_create()
        self.test_logs_list()
        self.test_logs_update()
        
        # Dashboard test
        self.test_dashboard_today()
        
        # AI Assistant test
        self.test_ai_assistant()
        
        # Error handling tests
        self.test_error_handling()
        
        # Access control test
        self.test_access_control()
        
        # Cleanup
        self.cleanup_test_data()
        
        # Print summary
        print("\n" + "=" * 50)
        print("🏁 TEST SUMMARY")
        print("=" * 50)
        print(f"✅ Passed: {self.test_results['passed']}")
        print(f"❌ Failed: {self.test_results['failed']}")
        
        if self.test_results['errors']:
            print("\n🔍 FAILED TESTS:")
            for error in self.test_results['errors']:
                print(f"   • {error}")
        
        success_rate = (self.test_results['passed'] / (self.test_results['passed'] + self.test_results['failed'])) * 100
        print(f"\n📊 Success Rate: {success_rate:.1f}%")
        
        if self.test_results['failed'] == 0:
            print("\n🎉 ALL TESTS PASSED! Backend is working correctly.")
            return True
        else:
            print(f"\n⚠️  {self.test_results['failed']} tests failed. Please check the errors above.")
            return False

if __name__ == "__main__":
    tester = MedControlTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)