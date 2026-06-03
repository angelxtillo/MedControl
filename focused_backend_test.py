#!/usr/bin/env python3
"""
Focused Backend Testing for MedControl Application - Logs Functionality
Tests specifically the logs functionality that needs retesting
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

class LogsTester:
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
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request error for {method} {url}: {str(e)}")
            return None

    def get_auth_headers(self):
        """Get authorization headers"""
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    def setup_test_data(self):
        """Setup test data for logs testing"""
        print("\n=== Setting up test data ===")
        
        # Register user
        test_user = {
            "name": "Test Logs User",
            "email": "testlogs@medcontrol.com",
            "password": "TestLogs2024!"
        }
        
        response = self.make_request('POST', '/auth/register', test_user)
        if response and response.status_code in [200, 201]:
            data = response.json()
            self.token = data['token']
            self.user_id = data['user']['id']
            print(f"✅ User created: {self.user_id}")
        else:
            print("❌ Failed to create user")
            return False
        
        # Create patient
        patient_data = {
            "name": "Test Patient for Logs",
            "age": 65,
            "notes": "Patient for testing logs functionality"
        }
        
        response = self.make_request('POST', '/patients', patient_data, self.get_auth_headers())
        if response and response.status_code in [200, 201]:
            data = response.json()
            self.patient_id = data['id']
            print(f"✅ Patient created: {self.patient_id}")
        else:
            print("❌ Failed to create patient")
            return False
        
        # Create medication
        medication_data = {
            "patient_id": self.patient_id,
            "name": "Test Medication",
            "dosage": "500mg",
            "frequency": "twice_daily",
            "schedule_times": ["08:00", "20:00"],
            "start_date": datetime.now().strftime("%Y-%m-%d"),
            "instructions": "Test medication for logs",
            "active": True
        }
        
        response = self.make_request('POST', '/medications', medication_data, self.get_auth_headers())
        if response and response.status_code in [200, 201]:
            data = response.json()
            self.medication_id = data['id']
            print(f"✅ Medication created: {self.medication_id}")
            return True
        else:
            print("❌ Failed to create medication")
            return False

    def test_logs_create_comprehensive(self):
        """Comprehensive test for creating logs"""
        print("\n=== Testing Logs - Create (Comprehensive) ===")
        
        # Test 1: Create log with "taken" status
        log_data = {
            "medication_id": self.medication_id,
            "patient_id": self.patient_id,
            "scheduled_datetime": datetime.now().strftime("%Y-%m-%dT08:00:00"),
            "status": "taken",
            "notes": "Medicamento tomado correctamente con el desayuno"
        }
        
        response = self.make_request('POST', '/logs', log_data, self.get_auth_headers())
        
        if response and response.status_code in [200, 201]:
            try:
                data = response.json()
                if 'id' in data and data.get('status') == 'taken':
                    self.log_id = data['id']
                    self.log_result("Log Create - Taken Status", True)
                    print(f"   Log ID: {self.log_id}")
                else:
                    self.log_result("Log Create - Taken Status", False, "Invalid response data")
            except json.JSONDecodeError:
                self.log_result("Log Create - Taken Status", False, "Invalid JSON response")
        else:
            self.log_result("Log Create - Taken Status", False, f"Status {response.status_code if response else 'None'}: {response.text if response else 'No response'}")
        
        # Test 2: Create log with "missed" status
        log_data_missed = {
            "medication_id": self.medication_id,
            "patient_id": self.patient_id,
            "scheduled_datetime": (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%dT07:00:00"),
            "status": "missed",
            "notes": "Medicamento no tomado - paciente dormía"
        }
        
        response = self.make_request('POST', '/logs', log_data_missed, self.get_auth_headers())
        
        if response and response.status_code in [200, 201]:
            try:
                data = response.json()
                if 'id' in data and data.get('status') == 'missed':
                    self.log_result("Log Create - Missed Status", True)
                else:
                    self.log_result("Log Create - Missed Status", False, "Invalid response data")
            except json.JSONDecodeError:
                self.log_result("Log Create - Missed Status", False, "Invalid JSON response")
        else:
            self.log_result("Log Create - Missed Status", False, f"Status {response.status_code if response else 'None'}")
        
        # Test 3: Create log with "skipped" status
        log_data_skipped = {
            "medication_id": self.medication_id,
            "patient_id": self.patient_id,
            "scheduled_datetime": (datetime.now() - timedelta(hours=2)).strftime("%Y-%m-%dT06:00:00"),
            "status": "skipped",
            "notes": "Medicamento omitido por indicación médica"
        }
        
        response = self.make_request('POST', '/logs', log_data_skipped, self.get_auth_headers())
        
        if response and response.status_code in [200, 201]:
            try:
                data = response.json()
                if 'id' in data and data.get('status') == 'skipped':
                    self.log_result("Log Create - Skipped Status", True)
                else:
                    self.log_result("Log Create - Skipped Status", False, "Invalid response data")
            except json.JSONDecodeError:
                self.log_result("Log Create - Skipped Status", False, "Invalid JSON response")
        else:
            self.log_result("Log Create - Skipped Status", False, f"Status {response.status_code if response else 'None'}")

    def test_logs_list_comprehensive(self):
        """Comprehensive test for listing logs"""
        print("\n=== Testing Logs - List (Comprehensive) ===")
        
        response = self.make_request('GET', f'/logs/patient/{self.patient_id}', headers=self.get_auth_headers())
        
        if response and response.status_code == 200:
            try:
                data = response.json()
                if isinstance(data, list):
                    # Should have at least 3 logs from previous tests
                    if len(data) >= 3:
                        self.log_result("Log List - Count", True)
                        print(f"   Found {len(data)} logs")
                        
                        # Check if logs have required fields
                        required_fields = ['id', 'medication_id', 'patient_id', 'scheduled_datetime', 'status']
                        all_have_fields = all(
                            all(field in log for field in required_fields)
                            for log in data
                        )
                        
                        if all_have_fields:
                            self.log_result("Log List - Required Fields", True)
                        else:
                            self.log_result("Log List - Required Fields", False, "Missing required fields in some logs")
                        
                        # Check if logs are sorted by scheduled_datetime (descending)
                        if len(data) > 1:
                            dates = [log['scheduled_datetime'] for log in data]
                            is_sorted = all(dates[i] >= dates[i+1] for i in range(len(dates)-1))
                            if is_sorted:
                                self.log_result("Log List - Sorting", True)
                            else:
                                self.log_result("Log List - Sorting", False, "Logs not sorted by scheduled_datetime desc")
                        else:
                            self.log_result("Log List - Sorting", True)  # Single item is sorted
                    else:
                        self.log_result("Log List - Count", False, f"Expected at least 3 logs, got {len(data)}")
                else:
                    self.log_result("Log List - Format", False, "Response is not a list")
            except json.JSONDecodeError:
                self.log_result("Log List - JSON", False, "Invalid JSON response")
        else:
            self.log_result("Log List - Request", False, f"Status {response.status_code if response else 'None'}")

    def test_logs_update_comprehensive(self):
        """Comprehensive test for updating logs"""
        print("\n=== Testing Logs - Update (Comprehensive) ===")
        
        if not self.log_id:
            self.log_result("Log Update - Setup", False, "No log ID available")
            return
        
        # Test 1: Update status from taken to missed
        update_data = {
            "status": "missed",
            "notes": "Actualizado: Medicamento marcado como perdido después de revisión"
        }
        
        response = self.make_request('PUT', f'/logs/{self.log_id}', update_data, self.get_auth_headers())
        
        if response and response.status_code == 200:
            try:
                data = response.json()
                if data.get('status') == 'missed' and 'Actualizado' in data.get('notes', ''):
                    self.log_result("Log Update - Status Change", True)
                else:
                    self.log_result("Log Update - Status Change", False, "Update not reflected correctly")
            except json.JSONDecodeError:
                self.log_result("Log Update - Status Change", False, "Invalid JSON response")
        else:
            self.log_result("Log Update - Status Change", False, f"Status {response.status_code if response else 'None'}")
        
        # Test 2: Update back to taken with taken_datetime
        update_data_taken = {
            "status": "taken",
            "taken_datetime": datetime.now().isoformat(),
            "notes": "Confirmado: Medicamento sí fue tomado correctamente"
        }
        
        response = self.make_request('PUT', f'/logs/{self.log_id}', update_data_taken, self.get_auth_headers())
        
        if response and response.status_code == 200:
            try:
                data = response.json()
                if (data.get('status') == 'taken' and 
                    data.get('taken_datetime') and 
                    'Confirmado' in data.get('notes', '')):
                    self.log_result("Log Update - Taken with DateTime", True)
                else:
                    self.log_result("Log Update - Taken with DateTime", False, "Update not reflected correctly")
            except json.JSONDecodeError:
                self.log_result("Log Update - Taken with DateTime", False, "Invalid JSON response")
        else:
            self.log_result("Log Update - Taken with DateTime", False, f"Status {response.status_code if response else 'None'}")

    def test_logs_access_control(self):
        """Test access control for logs"""
        print("\n=== Testing Logs - Access Control ===")
        
        # Create another user
        test_user2 = {
            "name": "Another User",
            "email": "another@medcontrol.com",
            "password": "Another2024!"
        }
        
        response = self.make_request('POST', '/auth/register', test_user2)
        
        if response and response.status_code in [200, 201]:
            try:
                data = response.json()
                other_token = data['token']
                other_headers = {"Authorization": f"Bearer {other_token}"}
                
                # Try to access first user's logs with second user's token
                response = self.make_request('GET', f'/logs/patient/{self.patient_id}', headers=other_headers)
                
                if response and response.status_code == 404:
                    self.log_result("Log Access Control - Patient Not Found", True)
                else:
                    self.log_result("Log Access Control - Patient Not Found", False, f"Expected 404, got {response.status_code if response else 'None'}")
                
                # Try to update first user's log with second user's token
                if self.log_id:
                    update_data = {"status": "taken", "notes": "Unauthorized update attempt"}
                    response = self.make_request('PUT', f'/logs/{self.log_id}', update_data, other_headers)
                    
                    if response and response.status_code == 404:
                        self.log_result("Log Access Control - Update Denied", True)
                    else:
                        self.log_result("Log Access Control - Update Denied", False, f"Expected 404, got {response.status_code if response else 'None'}")
                
            except json.JSONDecodeError:
                self.log_result("Log Access Control", False, "Invalid JSON response")
        else:
            self.log_result("Log Access Control", False, "Failed to create second user")

    def test_logs_error_scenarios(self):
        """Test error scenarios for logs"""
        print("\n=== Testing Logs - Error Scenarios ===")
        
        # Test 1: Create log with invalid patient_id
        invalid_log_data = {
            "medication_id": self.medication_id,
            "patient_id": "invalid_patient_id",
            "scheduled_datetime": datetime.now().strftime("%Y-%m-%dT08:00:00"),
            "status": "taken"
        }
        
        response = self.make_request('POST', '/logs', invalid_log_data, self.get_auth_headers())
        
        if response and response.status_code == 404:
            self.log_result("Log Error - Invalid Patient", True)
        else:
            self.log_result("Log Error - Invalid Patient", False, f"Expected 404, got {response.status_code if response else 'None'}")
        
        # Test 2: Update non-existent log
        update_data = {"status": "taken"}
        response = self.make_request('PUT', '/logs/nonexistent_log_id', update_data, self.get_auth_headers())
        
        if response and response.status_code == 404:
            self.log_result("Log Error - Nonexistent Log", True)
        else:
            self.log_result("Log Error - Nonexistent Log", False, f"Expected 404, got {response.status_code if response else 'None'}")

    def cleanup_test_data(self):
        """Clean up test data"""
        print("\n=== Cleaning up test data ===")
        
        # Delete medication (this will also delete logs)
        if self.medication_id:
            response = self.make_request('DELETE', f'/medications/{self.medication_id}', headers=self.get_auth_headers())
            if response and response.status_code == 200:
                print("✅ Medication and related logs deleted")
            else:
                print("❌ Failed to delete medication")
        
        # Delete patient
        if self.patient_id:
            response = self.make_request('DELETE', f'/patients/{self.patient_id}', headers=self.get_auth_headers())
            if response and response.status_code == 200:
                print("✅ Patient deleted")
            else:
                print("❌ Failed to delete patient")

    def run_focused_logs_tests(self):
        """Run focused tests on logs functionality"""
        print("🚀 Starting MedControl Backend Logs Testing")
        print("=" * 50)
        
        # Setup test data
        if not self.setup_test_data():
            print("❌ Cannot continue without test data setup")
            return False
        
        # Run logs tests
        self.test_logs_create_comprehensive()
        self.test_logs_list_comprehensive()
        self.test_logs_update_comprehensive()
        self.test_logs_access_control()
        self.test_logs_error_scenarios()
        
        # Cleanup
        self.cleanup_test_data()
        
        # Print summary
        print("\n" + "=" * 50)
        print("🏁 LOGS TESTING SUMMARY")
        print("=" * 50)
        print(f"✅ Passed: {self.test_results['passed']}")
        print(f"❌ Failed: {self.test_results['failed']}")
        
        if self.test_results['errors']:
            print("\n🔍 FAILED TESTS:")
            for error in self.test_results['errors']:
                print(f"   • {error}")
        
        success_rate = (self.test_results['passed'] / (self.test_results['passed'] + self.test_results['failed'])) * 100 if (self.test_results['passed'] + self.test_results['failed']) > 0 else 0
        print(f"\n📊 Success Rate: {success_rate:.1f}%")
        
        if self.test_results['failed'] == 0:
            print("\n🎉 ALL LOGS TESTS PASSED! Logs functionality is working correctly.")
            return True
        else:
            print(f"\n⚠️  {self.test_results['failed']} tests failed. Please check the errors above.")
            return False

if __name__ == "__main__":
    tester = LogsTester()
    success = tester.run_focused_logs_tests()
    sys.exit(0 if success else 1)