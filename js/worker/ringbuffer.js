
// Copyright (c) 2014 L Angrave
// All Rights Reserved.

// This source code is provided and licensed under the following conditions:
// Firstly, this code is licensed under Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0.html)
// Secondly, this code is licensed under the University of Illinois/NCSA Open Source License (http://opensource.org/licenses/NCSA)
// Thirdly, this code may be relicensed under any open source license that is approved and recognized by the Open Source Initiative (http://opensource.org/)

// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.


// Ring Buffer - An O(1) fast, extendable circular queue that supports a subset of js array semantics - shift,unshift,push,pop methods and length property. 
// Expensive memory re-allocation is ammortized. 
// This version uses a Int32Array backend, however this is trivial to override (see _new_array() ).

function RingBuffer() {
  this.reset();
}

RingBuffer.prototype.reset = function (){
  // Code uses the lowest bits of this.begin, this.end i.e. always bitwise-and with this.array.length

  this.begin = 0x0; // First valid entry in the Ring buffer
  this.end = 0x0; // Position of the next free position at the end of the Ring buffer.
  this.length = 0x0;
  
  this._shrink_count = 0x0; // Only used to verify test coverage
  this.min_capacity = 128; // smallest capacity that the buffer will shrink to

  this.array = this._new_array(0x10);
  this.empty_value = this.array[0]; // Useful to remove object pointers.
}

// Creates the storage array. Overload this method to use a different storage class
RingBuffer.prototype._new_array = function(size) {
  return new Int32Array(size);
}

RingBuffer.prototype._realloc = function (size) {
  var len = this.length;
  if(len>size) return; //sanity check
  
  var old = this.array;

  this.array = this._new_array(size); 

  // Copy values upto the end of the old array
  var i = 0x0, j = this.begin;
  var wrap = Math.min( len, old.length - j ) ;
  while(i < wrap)
     this.array[ i++ ] = old[ j++ ];

  // Copy values that wrapped around
  j = 0;
  while(i < len)
    this.array[ i++ ] = old[ j++ ];

  
  this.begin = 0x0;
  this.end = len;
}

RingBuffer.prototype._check_grow = function() {
  if( this.length == this.array.length)
     this._realloc( this.length << 1 );
}

RingBuffer.prototype._check_shrink = function() {
  // We assume that the ringbuffer may be filled again in the near future and re-allocation is expensive
  // so we are reluctant to shrink the buffer capacity
  // Also, when we do shrink, we ensure the buffer is no more than half full
  var candidate_size = this.array.length >> 2; // If we shrink we will quarter our size
  if( this.length <= (candidate_size>>1) && candidate_size >= this.min_capacity  ) {
    this._shrink_count++;
    this._realloc(  candidate_size ); 
  }
}

// Public methods:


// No error checking. Assumes 0<= index < this.length
RingBuffer.prototype.get = function (index) {
  return this.array[ (this.begin + index ) % this.array.length ];
}

// Adds to the end of the buffer. Returns the new length of the buffer
RingBuffer.prototype.push = function (value) {
  this._check_grow();
  
  this.array[ this.end ] = value;
  this.end = (this.end + 1) % this.array.length;
  return ++ this.length;
}

// Adds to the beginning of the buffer. Returns the new length of the buffer
RingBuffer.prototype.unshift = function (value) {
  this._check_grow();
  
  this.begin = (this.begin + this.array.length - 1) % this.array.length;
  this.array[ this.begin ] = value;

  return ++ this.length;  
}

// Removes (and returns) the last item in the buffer.
RingBuffer.prototype.pop = function () {
  if(this.length === 0) 
    return;
    
  this._check_shrink();
  
  -- this.length;
  this.end = (this.end + this.array.length - 1) % this.array.length;
  
  var result = this.array[ this.end ];
  this.array[ this.end ] = this.empty_value;
  return result;
}

// Removes (and returns) the first item in the buffer
RingBuffer.prototype.shift = function () {
  if(this.length === 0) 
    return;
    
  this._check_shrink();
    
  -- this.length;
  var result = this.array[ this.begin ];
  
  this.array[ this.begin ] = this.empty_value;
  
  this.begin = (this.begin + 1) % this.array.length;
  
  return result;
}




RingBuffer.prototype.join = function(sep) {
  
  if(arguments.length ==0)
    sep = ",";
  
  var len = this.length;

  var result = len > 0 ? this.get(0) : "";
  for(var i = 1; i < len; i++)
    result += sep + this.get(i);
    
  return result;
}
// Returns a string representation 
RingBuffer.prototype.toString = function() {
  return this.join(",");
}

/*
RingBuffer.prototype.test = function() {
  console.log("Ring Buffer Tests test_random_sequence - Starting");
  var cb = new RingBuffer();
  cb.min_capacity=8; // Reduce min shrink count to get more shrink operations
  var array = [];
  var i = 0x0;
  var got,expected;
  try {
    for(; i < 100000; i++) {
      var val = i | 0, result = -1;
      if(cb.length != array.length) 
        throw "#"+i+".length got "+cb.length+" expected "+array.length;
        
      var operation = Math.floor(Math.random() * 5);
      
      // Test skrinkage. After 4096 operations favor reducing the size back towards zero
      // Then for the next 4096 operations random walk away from zero size
      if( ((i>>12)&1) == 1 && operation <2 && Math.random()>0.1) operation +=2;

      if(operation ==0 && (got=cb.unshift(val)) != (expected=array.unshift(val))) 
        throw "#"+i+". unshift("+val+") got "+got+" expected " + expected;
        
      if(operation ==1 && (got=cb.push(val)) != (expected=array.push(val))) 
        throw "#"+i+".push() got "+got+" expected " + expected;

      if(operation ==2 && (got=cb.pop()) != (expected=array.pop())) 
        throw "#"+i+".pop("+val+") got "+got+" expected " + expected;
        
      if(operation ==3 && (got=cb.shift()) != (expected=array.shift())) 
        throw "#"+i+".shift() got "+got+" expected " + expected;
        
      if(operation ==4 && (got=cb.get(i%array.length)) != (expected=array[i%array.length])) 
        throw "#"+i+".shift() got "+got+" expected " + expected;

    }
    console.log("shrink count #"+cb._shrink_count);
    if(cb._shrink_count <4)
       throw "shrink not tested "+cb._shrink_count;
       
  } catch(e) {
    
    console.log(e);
    console.log("in,out: ["+cb.in +","+cb.out+"]. length="+cb.length+", buffer length="+cb.array.length);

    return false;
  }

  return true;
}

alert( "Ring Buffer Tests " + (RingBuffer.prototype.test() ? "PASSED":"FAILED") );
*/