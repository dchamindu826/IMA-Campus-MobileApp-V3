import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Modal from 'react-native-modal';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const CustomAlert = ({ isVisible, title, message, type, onClose }) => {
  const isSuccess = type === 'success';
  const themeColor = isSuccess ? '#4CAF50' : '#D32F2F'; //

  return (
    <Modal isVisible={isVisible} animationIn="zoomIn" animationOut="zoomOut" backdropOpacity={0.4}>
      <View style={styles.container}>
        {/* Taller and colorful header */}
        <View style={[styles.header, { backgroundColor: themeColor }]}>
          <Icon name={isSuccess ? 'check-circle' : 'alert-circle'} size={70} color="white" />
        </View>
        
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          
          <TouchableOpacity 
            style={[styles.btn, { backgroundColor: themeColor }]} 
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>CONTINUE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 30, // More rounded
    overflow: 'hidden',
    marginHorizontal: 15,
  },
  header: {
    height: 140, // Taller header
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#333',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  btn: {
    width: '100%',
    height: 55,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  btnText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  }
});

export default CustomAlert;